"""
F1 24 Telemetry Server - High Performance FastAPI + Async UDP Listener + WebSocket Broadcast
Zero-backpressure dropping queue architecture ensuring sub-5ms latency at 60Hz.
"""

from __future__ import annotations
import sys
import os

# Guarantee stdout and stderr exist when running headless under pythonw on Windows
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from typing import Set, Dict, Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .protocol.f124_packets import (
    unpack_player_telemetry,
    unpack_player_status,
    PACKET_ID_CAR_TELEMETRY,
    PACKET_ID_CAR_STATUS,
    HEADER_SIZE,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("F1TelemetryServer")

UDP_HOST = os.getenv("F1_UDP_HOST", "0.0.0.0")
UDP_PORT = int(os.getenv("F1_UDP_PORT", "20777"))

from pathlib import Path
CONFIG_PATH = Path(__file__).resolve().parent.parent / "hud_config.json"

DEFAULT_HUD_CONFIG = {
    "accentColor": "#09f1da",
    "panelBg": "#08090c",
    "opacity": 88,
    "borderRadius": 0,
    "borderWidth": 0,
    "borderGlow": False,
    "borderGlowIntensity": 0,
    "ledHeight": 10,
    "gearSize": "text-7xl",
    "scale": 100,
    "theme": "mercedes"
}

current_hud_config: Dict[str, Any] = dict(DEFAULT_HUD_CONFIG)

def load_persisted_config():
    global current_hud_config
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    current_hud_config.update(data)
                    logger.info(f"Loaded persisted HUD config from {CONFIG_PATH}")
        except Exception as e:
            logger.warning(f"Could not load HUD config: {e}")

def save_persisted_config():
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(current_hud_config, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to persist HUD config: {e}")

load_persisted_config()


class TelemetryState:
    """Thread-safe state repository holding current telemetry values."""
    def __init__(self):
        self.lock = asyncio.Lock()
        self.max_rpm: int = 13500
        self.idle_rpm: int = 4000
        self.drs_allowed: int = 0
        self.ers_store_energy: float = 4_000_000.0
        self.ers_deploy_mode: int = 0
        
        # Latest unified telemetry payload
        self.latest_frame: Optional[Dict[str, Any]] = None

    def update_status(self, max_rpm: int, drs_allowed: int, ers_energy: float, ers_mode: int):
        self.max_rpm = max_rpm
        self.drs_allowed = drs_allowed
        self.ers_store_energy = ers_energy
        self.ers_deploy_mode = ers_mode

    def build_frame(self, telem_data, session_time: float) -> Dict[str, Any]:
        return {
            "time": session_time,
            "speed": telem_data.speed,
            "throttle": round(telem_data.throttle, 3),
            "brake": round(telem_data.brake, 3),
            "steer": round(telem_data.steer, 3),
            "gear": telem_data.gear,
            "engineRPM": telem_data.engine_rpm,
            "maxRPM": self.max_rpm,
            "drs": telem_data.drs,
            "drsAllowed": self.drs_allowed,
            "ersStoreEnergy": round(self.ers_store_energy, 1),
            "ersDeployMode": self.ers_deploy_mode,
            "brakesTemperature": list(telem_data.brakes_temperature),
            "tyresSurfaceTemperature": list(telem_data.tyres_surface_temperature),
            "sendTimestampMs": time.perf_counter() * 1000.0,
        }


class F1DatagramProtocol(asyncio.DatagramProtocol):
    """
    Non-blocking Async DatagramProtocol for zero-copy ingest of UDP packets.
    Directly unpacks Packet ID 6 and 7, dropping stale queue frames to enforce zero backpressure.
    """
    def __init__(self, queue: asyncio.Queue, state: TelemetryState):
        super().__init__()
        self.queue = queue
        self.state = state
        self.transport = None
        self.packets_received = 0
        self.last_packet_time = 0.0
        self.last_sender = None
        self.packet_counts: Dict[int, int] = {}

    def connection_made(self, transport):
        self.transport = transport
        logger.info("UDP Datagram transport bound and listening.")

    def datagram_received(self, data: bytes, addr):
        if len(data) < HEADER_SIZE:
            return

        packet_id = data[6]  # Packet ID offset in F1 24 header (data[0:2]=format, 2=year, 3=major, 4=minor, 5=version, 6=packet_id)
        self.packets_received += 1
        self.last_packet_time = time.time()
        self.last_sender = addr
        self.packet_counts[packet_id] = self.packet_counts.get(packet_id, 0) + 1

        if self.packets_received == 1 or self.packets_received % 300 == 0:
            logger.info(f"Recebendo telemetria real de {addr}! Packet ID: {packet_id}, Total: {self.packets_received}")

        try:
            if packet_id == PACKET_ID_CAR_STATUS:
                _, status = unpack_player_status(data)
                self.state.update_status(
                    max_rpm=status.max_rpm,
                    drs_allowed=status.drs_allowed,
                    ers_energy=status.ers_store_energy,
                    ers_mode=status.ers_deploy_mode,
                )
            elif packet_id == PACKET_ID_CAR_TELEMETRY:
                header, telem = unpack_player_telemetry(data)
                frame = self.state.build_frame(telem, header.session_time)
                frame["packetsReceived"] = self.packets_received
                frame["sender"] = f"{addr[0]}:{addr[1]}"
                
                # Dropping queue mechanism: ensure queue never buffers more than 1 latest frame
                while not self.queue.empty():
                    try:
                        self.queue.get_nowait()
                        self.queue.task_done()
                    except (asyncio.QueueEmpty, ValueError):
                        break
                
                self.queue.put_nowait(frame)
        except Exception as e:
            logger.error(f"Erro ao desempacotar pacote ID {packet_id}: {e}")

    def error_received(self, exc):
        logger.warning(f"UDP Error received: {exc}")

    def connection_lost(self, exc):
        logger.info("UDP Datagram transport closed.")


class WebSocketBroadcaster:
    """Manages active client websockets and broadcasts telemetry with zero lag."""
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self.lock:
            self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket):
        async with self.lock:
            self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, payload: Dict[str, Any]):
        if not self.active_connections:
            return

        message = json.dumps(payload)
        dead_sockets = []

        async with self.lock:
            clients = list(self.active_connections)

        for client in clients:
            try:
                await client.send_text(message)
            except Exception:
                dead_sockets.append(client)

        if dead_sockets:
            async with self.lock:
                for s in dead_sockets:
                    self.active_connections.discard(s)


telemetry_queue: asyncio.Queue = asyncio.Queue(maxsize=2)
telemetry_state = TelemetryState()
broadcaster = WebSocketBroadcaster()
broadcast_worker_task: Optional[asyncio.Task] = None
udp_transport = None


async def broadcast_loop():
    """Reads freshest frame from queue and broadcasts immediately to all connected HUDs."""
    logger.info("WebSocket Broadcast loop initiated.")
    while True:
        try:
            frame = await telemetry_queue.get()
            payload = {
                "type": "telemetry",
                "data": frame,
                **frame
            }
            await broadcaster.broadcast(payload)
            telemetry_queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in broadcast loop: {e}")
            await asyncio.sleep(0.001)


udp_protocol_instance: Optional[F1DatagramProtocol] = None
mock_simulator_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start UDP listener and broadcast worker
    global udp_transport, broadcast_worker_task, udp_protocol_instance
    loop = asyncio.get_running_loop()
    
    logger.info(f"Binding UDP listener on {UDP_HOST}:{UDP_PORT}...")
    try:
        def protocol_factory():
            global udp_protocol_instance
            udp_protocol_instance = F1DatagramProtocol(telemetry_queue, telemetry_state)
            return udp_protocol_instance

        transport, _ = await loop.create_datagram_endpoint(
            protocol_factory,
            local_addr=(UDP_HOST, UDP_PORT),
        )
        udp_transport = transport
    except Exception as e:
        logger.error(f"Failed to bind UDP socket on {UDP_HOST}:{UDP_PORT}: {e}")

    broadcast_worker_task = asyncio.create_task(broadcast_loop())
    yield
    # Shutdown
    if broadcast_worker_task:
        broadcast_worker_task.cancel()
    if mock_simulator_task and not mock_simulator_task.done():
        mock_simulator_task.cancel()
    if udp_transport:
        udp_transport.close()
    logger.info("Server shutdown complete.")


app = FastAPI(title="F1 24 Custom HUD Telemetry Core", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

STATIC_DIR = Path(__file__).resolve().parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
@app.get("/preview")
async def preview_studio():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"message": "F1 24 Custom HUD Core API is running. Open /health for status."}


@app.get("/cockpit.jpg")
async def cockpit_image():
    img_path = STATIC_DIR / "cockpit.jpg"
    if img_path.exists():
        return FileResponse(str(img_path))
    return {"message": "cockpit.jpg not found"}


@app.get("/overlay")
async def in_game_overlay():
    overlay_path = STATIC_DIR / "overlay.html"
    if overlay_path.exists():
        return FileResponse(str(overlay_path))
    return {"message": "overlay.html not found"}


@app.get("/health")
async def health_check():
    packets = udp_protocol_instance.packets_received if udp_protocol_instance else 0
    last_time = udp_protocol_instance.last_packet_time if udp_protocol_instance else 0
    sender = udp_protocol_instance.last_sender if udp_protocol_instance else None
    is_live = (time.time() - last_time < 2.0) if last_time > 0 else False

    return {
        "status": "online",
        "udp_port": UDP_PORT,
        "udp_host": UDP_HOST,
        "game_connected": is_live,
        "packets_received": packets,
        "packet_types": udp_protocol_instance.packet_counts if udp_protocol_instance else {},
        "last_sender": f"{sender[0]}:{sender[1]}" if sender else None,
        "active_clients": len(broadcaster.active_connections),
        "queue_size": telemetry_queue.qsize(),
    }


@app.post("/api/simulator/start")
async def start_mock_simulator():
    global mock_simulator_task
    if mock_simulator_task and not mock_simulator_task.done():
        return {"status": "running"}
    from .protocol.mock_producer import run_producer_async
    mock_simulator_task = asyncio.create_task(run_producer_async(port=UDP_PORT))
    return {"status": "started"}


@app.post("/api/simulator/stop")
async def stop_mock_simulator():
    global mock_simulator_task
    if mock_simulator_task and not mock_simulator_task.done():
        mock_simulator_task.cancel()
        mock_simulator_task = None
        return {"status": "stopped"}
    return {"status": "not_running"}


@app.get("/api/config")
async def get_hud_config():
    return current_hud_config


@app.post("/api/config")
async def set_hud_config(payload: Dict[str, Any]):
    global current_hud_config
    current_hud_config.update(payload)
    save_persisted_config()
    # Immediately broadcast to all connected HUD instances (both browser and overlay window)
    await broadcaster.broadcast({"type": "config_update", "config": current_hud_config})
    return {"status": "ok", "config": current_hud_config}


@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await broadcaster.connect(websocket)
    try:
        # Greet client immediately with current config
        await websocket.send_text(json.dumps({"type": "config_update", "config": current_hud_config}))
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            elif data.startswith("{"):
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "config_update":
                        new_cfg = msg.get("config", {})
                        if isinstance(new_cfg, dict):
                            current_hud_config.update(new_cfg)
                            save_persisted_config()
                            # Broadcast to all clients including pywebview overlay
                            await broadcaster.broadcast({"type": "config_update", "config": current_hud_config})
                except Exception as e:
                    logger.warning(f"Error handling WS client message: {e}")
    except WebSocketDisconnect:
        await broadcaster.disconnect(websocket)
    except Exception:
        await broadcaster.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "8000"))
    uvicorn.run("backend.server:app", host=host, port=port, log_level="info")

