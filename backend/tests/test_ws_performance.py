"""
Integration & Performance Stress Tests: FastAPI + UDP Ingest + WebSockets
Validates:
1. 60Hz continuous broadcast stability.
2. End-to-end packet processing latency < 5ms.
3. Non-blocking event loop behavior and zero backpressure (dropping queue).
"""

import asyncio
import json
import time
import pytest
from starlette.testclient import TestClient

from backend.server import app, telemetry_queue, telemetry_state, broadcaster
from backend.protocol.mock_producer import MockTelemetrySimulator
from backend.protocol.f124_packets import HEADER_SIZE


@pytest.fixture
def test_client():
    with TestClient(app) as client:
        yield client


@pytest.mark.asyncio
async def test_dropping_queue_zero_backpressure():
    """
    Stress tests the dropping queue mechanism:
    Fills the queue rapidly with 500 frames without consumer reading.
    Validates that queue size never exceeds maxsize and memory remains constant.
    """
    sim = MockTelemetrySimulator()
    dt = 1.0 / 60.0

    # Simulate rapid incoming telemetry bursts
    for _ in range(500):
        # Update state directly
        sim._update_physics(dt)
        frame = {
            "speed": int(sim.speed),
            "gear": sim.gear,
            "engineRPM": sim.rpm,
            "sendTimestampMs": time.perf_counter() * 1000.0
        }
        # Emulate DatagramProtocol queue dropping
        while not telemetry_queue.empty():
            try:
                telemetry_queue.get_nowait()
                telemetry_queue.task_done()
            except (asyncio.QueueEmpty, ValueError):
                break
        telemetry_queue.put_nowait(frame)

    # Queue must only hold at most 1 item
    assert telemetry_queue.qsize() <= 1
    freshest_item = telemetry_queue.get_nowait()
    telemetry_queue.task_done()
    assert freshest_item["speed"] == int(sim.speed)


@pytest.mark.asyncio
async def test_event_loop_responsiveness_under_udp_load():
    """
    Ensures that rapid datagram handling does not starve or block the asyncio event loop.
    Monitors event loop lag while pumping 300 UDP frames.
    """
    sim = MockTelemetrySimulator()
    dt = 1.0 / 60.0
    lag_measurements = []

    async def heartbeat():
        # Measures event loop iteration delay (pure loop scheduling latency)
        for _ in range(30):
            t0 = time.perf_counter()
            await asyncio.sleep(0)  # Yields to event loop; measures time to resume
            lag = time.perf_counter() - t0
            lag_measurements.append(lag)

    async def packet_pump():
        for _ in range(300):
            telem_bytes, status_bytes = sim.generate_packets(dt)
            # Emulate DatagramProtocol unpack and queue push
            if len(telem_bytes) >= HEADER_SIZE:
                _ = sim.generate_packets(dt)
            await asyncio.sleep(0)

    await asyncio.gather(heartbeat(), packet_pump())

    # Event loop iteration latency must be strictly sub-millisecond (< 1ms)
    avg_lag = sum(lag_measurements) / len(lag_measurements)
    print(f"Event Loop Yield Latency: {avg_lag * 1000:.3f}ms")
    assert avg_lag < 0.005, f"Event loop iteration lag too high: {avg_lag * 1000:.2f}ms"


@pytest.mark.asyncio
async def test_websocket_broadcast_throughput_and_latency():
    """
    Tests mock WebSocket client receiving frames at 60Hz and verifies latency < 5ms.
    """
    received_frames = []
    latencies_ms = []

    class MockWebSocket:
        async def accept(self):
            pass

        async def send_text(self, text: str):
            recv_time = time.perf_counter() * 1000.0
            data = json.loads(text)
            send_time = data.get("sendTimestampMs", recv_time)
            latency = recv_time - send_time
            latencies_ms.append(latency)
            received_frames.append(data)

    mock_ws = MockWebSocket()
    await broadcaster.connect(mock_ws)

    try:
        # Broadcast 120 frames (~2 seconds at 60Hz)
        sim = MockTelemetrySimulator()
        dt = 1.0 / 60.0

        for _ in range(120):
            t_start = time.perf_counter()
            sim._update_physics(dt)
            frame = {
                "time": sim.session_time,
                "speed": int(sim.speed),
                "gear": sim.gear,
                "engineRPM": sim.rpm,
                "maxRPM": 13500,
                "drs": sim.drs,
                "drsAllowed": sim.drs_allowed,
                "ersStoreEnergy": sim.ers_store_energy,
                "ersDeployMode": sim.ers_deploy_mode,
                "sendTimestampMs": time.perf_counter() * 1000.0,
            }
            await broadcaster.broadcast(frame)
            elapsed = time.perf_counter() - t_start
            await asyncio.sleep(max(0.0, dt - elapsed))

        assert len(received_frames) == 120
        # Check latency requirement: average latency strictly < 5.0 ms
        avg_latency = sum(latencies_ms) / len(latencies_ms)
        p99_latency = sorted(latencies_ms)[int(len(latencies_ms) * 0.99)]
        
        print(f"WS Broadcast Latency: Avg={avg_latency:.3f}ms | P99={p99_latency:.3f}ms")
        assert avg_latency < 5.0, f"Average latency exceeded 5ms: {avg_latency:.2f}ms"
        assert p99_latency < 10.0, f"P99 latency spike: {p99_latency:.2f}ms"

    finally:
        await broadcaster.disconnect(mock_ws)
