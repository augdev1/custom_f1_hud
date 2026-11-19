r"""Real localhost UDP -> parser -> WebSocket harness. No Docker, no game needed.
Run from repo: .venv\Scripts\python.exe -m scripts.harness_live
Refuses to inject while another sender is active. Leaves backend running.
"""
import asyncio
import json
import socket
import time
import urllib.request
from pathlib import Path

import websockets
from backend.protocol.mock_producer import MockTelemetrySimulator

BASE = "http://127.0.0.1:8765"

def health():
    with urllib.request.urlopen(BASE + "/health", timeout=3) as response:
        return json.load(response)

async def run():
    initial = health()
    assert initial.get("udp_port") == 20777, "Not the F1 backend"
    assert not initial["game_connected"], "Another UDP source is active; stop simulation/game first"
    frames = []
    latencies = []
    simulator = MockTelemetrySimulator()
    start = time.perf_counter()
    async with websockets.connect("ws://127.0.0.1:8765/ws/telemetry") as ws:
        greeting = json.loads(await ws.recv())
        assert greeting["type"] == "config_update"
        async def receive():
            while True:
                raw = json.loads(await ws.recv())
                if raw.get("type") == "telemetry":
                    frame = raw["data"]
                    assert raw["speed"] == frame["speed"], "Dual payload regression"
                    frames.append(frame)
                    latencies.append(time.perf_counter()*1000-frame["sendTimestampMs"])
        receiver = asyncio.create_task(receive())
        try:
            with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as sender:
                for i in range(1200):
                    telemetry,status = simulator.generate_packets(1/60)
                    sender.sendto(status,("127.0.0.1",20777))
                    sender.sendto(telemetry,("127.0.0.1",20777))
                    await asyncio.sleep(max(0,start+(i+1)/60-time.perf_counter()))
            await asyncio.sleep(.3)
        finally:
            receiver.cancel()
            try:
                await receiver
            except asyncio.CancelledError:
                pass
    assert len(frames) >= 1100, f"Only {len(frames)}/1200 frames arrived"
    assert min(f["speed"] for f in frames) <= 81
    assert max(f["speed"] for f in frames) >= 339
    assert max(f["throttle"] for f in frames) >= .99
    assert max(f["brake"] for f in frames) >= .99
    assert {2,3,4,5,6,7,8}.issubset({f["gear"] for f in frames})
    assert {0,1}.issubset({f["drs"] for f in frames})
    assert min(f["ersStoreEnergy"] for f in frames) < 3_700_000
    await asyncio.sleep(2.2)
    final = health()
    assert not final["game_connected"], "Stale UDP stream reported live"
    assert final["queue_size"] <= 1
    result={"result":"PASS","sent_frames":1200,"received_frames":len(frames),"speed_range":[min(f["speed"] for f in frames),max(f["speed"] for f in frames)],"gears":sorted({f["gear"] for f in frames}),"peak_throttle":max(f["throttle"] for f in frames),"peak_brake":max(f["brake"] for f in frames),"drs_states":sorted({f["drs"] for f in frames}),"server_to_ws_ms_mean":round(sum(latencies)/len(latencies),3),"server_to_ws_ms_p99":round(sorted(latencies)[int(len(latencies)*.99)],3),"stale_detected":not final["game_connected"],"final_health":final}
    Path("scratch").mkdir(exist_ok=True)
    Path("scratch/harness-live.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
    print(json.dumps(result,indent=2))

if __name__ == "__main__":
    asyncio.run(run())
