"""
Mock Telemetry Producer (F1 24 60Hz UDP Simulator)
Emits binary Codemasters F1 24 packets (Packet ID 6 and 7) over UDP on port 20777.
Generates realistic driving dynamics: acceleration, gear shifts, braking, DRS zones, and ERS drain.
"""

from __future__ import annotations
import socket
import time
import math
import argparse
import asyncio
from typing import Optional

from .f124_packets import (
    PacketHeader,
    PlayerTelemetryData,
    PlayerStatusData,
    pack_full_telemetry_packet,
    pack_full_status_packet,
    PACKET_ID_CAR_TELEMETRY,
    PACKET_ID_CAR_STATUS,
    NUM_CARS,
)


class MockTelemetrySimulator:
    def __init__(self, target_host: str = "127.0.0.1", target_port: int = 20777, player_index: int = 0):
        self.target_host = target_host
        self.target_port = target_port
        self.player_index = player_index
        
        # State variables
        self.frame_id = 0
        self.session_time = 0.0
        self.speed = 100.0  # km/h
        self.gear = 2
        self.rpm = 8000
        self.max_rpm = 13500
        self.throttle = 0.0
        self.brake = 0.0
        self.steer = 0.0
        self.drs = 0
        self.drs_allowed = 0
        self.ers_store_energy = 4_000_000.0  # 4 MJ max
        self.ers_deploy_mode = 2  # Hotlap
        
        # Tyre and brake temps
        self.tyre_temps = [95, 96, 98, 97]
        self.brake_temps = [400, 410, 480, 470]

    def _update_physics(self, dt: float):
        """Simulate realistic telemetry progression across a speed cycle (0 - 340 km/h)."""
        self.session_time += dt
        self.frame_id += 1
        
        cycle = (self.session_time % 20.0)  # 20 second recurring lap segment
        
        if cycle < 10.0:
            # Acceleration phase (0 to 10s)
            progress = cycle / 10.0
            self.throttle = min(1.0, 0.4 + 0.6 * math.sin(progress * math.pi / 2))
            self.brake = 0.0
            self.steer = 0.05 * math.sin(cycle * 3)
            
            # Accelerate up to 340 km/h
            self.speed = 80.0 + (340.0 - 80.0) * progress
            
            # Gear selection based on speed
            if self.speed < 105:
                self.gear = 2
                base_speed = 80.0
            elif self.speed < 145:
                self.gear = 3
                base_speed = 105.0
            elif self.speed < 190:
                self.gear = 4
                base_speed = 145.0
            elif self.speed < 235:
                self.gear = 5
                base_speed = 190.0
            elif self.speed < 280:
                self.gear = 6
                base_speed = 235.0
            elif self.speed < 315:
                self.gear = 7
                base_speed = 280.0
            else:
                self.gear = 8
                base_speed = 315.0
                
            # RPM curves within gear
            gear_ratio_factor = (self.speed - base_speed) / 45.0
            self.rpm = int(8500 + min(1.0, max(0.0, gear_ratio_factor)) * 4800)
            
            # DRS zone enabled above 260 km/h on straight
            if self.speed > 260.0:
                self.drs_allowed = 1
                self.drs = 1
            else:
                self.drs_allowed = 0
                self.drs = 0
                
            # ERS deploy active on full throttle
            self.ers_deploy_mode = 3 if self.speed > 250 else 2
            self.ers_store_energy = max(200_000.0, self.ers_store_energy - 35_000.0 * dt)
            
            # Brake cool down
            self.brake_temps = [max(250, int(t - 15 * dt)) for t in self.brake_temps]
            self.tyre_temps = [min(115, int(t + 0.8 * dt)) for t in self.tyre_temps]

        elif cycle < 13.5:
            # Heavy Braking phase into chicane (10s to 13.5s)
            brake_progress = (cycle - 10.0) / 3.5
            self.throttle = 0.0
            self.brake = max(0.2, 1.0 - 0.7 * brake_progress)  # Peak braking then trail
            self.drs = 0
            self.drs_allowed = 0
            
            # Decelerate from 340 to 80 km/h
            self.speed = max(80.0, 340.0 - (340.0 - 80.0) * brake_progress)
            
            if self.speed > 280:
                self.gear = 7
            elif self.speed > 230:
                self.gear = 6
            elif self.speed > 180:
                self.gear = 5
            elif self.speed > 140:
                self.gear = 4
            elif self.speed > 105:
                self.gear = 3
            else:
                self.gear = 2
                
            self.rpm = int(9000 + (self.speed % 40) * 100)
            self.ers_deploy_mode = 1  # Harvesting under braking
            self.ers_store_energy = min(4_000_000.0, self.ers_store_energy + 80_000.0 * dt)
            
            # Brake temps skyrocket
            self.brake_temps = [min(950, int(t + 120 * dt)) for t in self.brake_temps]
            self.tyre_temps = [min(125, int(t + 2.0 * dt)) for t in self.tyre_temps]
            self.steer = 0.0

        else:
            # Cornering phase (13.5s to 20s)
            corner_progress = (cycle - 13.5) / 6.5
            self.throttle = 0.4 + 0.5 * corner_progress
            self.brake = 0.0
            self.steer = 0.4 * math.sin(corner_progress * math.pi)
            self.speed = 80.0 + 80.0 * corner_progress
            self.gear = 3 if self.speed < 130 else 4
            self.rpm = int(9500 + (self.speed - 80) * 40)
            self.drs = 0
            self.drs_allowed = 0
            self.ers_deploy_mode = 2
            self.ers_store_energy = max(500_000.0, self.ers_store_energy - 15_000.0 * dt)

    def generate_packets(self, dt: float) -> tuple[bytes, bytes]:
        """Generates a binary Telemetry packet and a Status packet for current tick."""
        self._update_physics(dt)
        
        # Telemetry packet
        header_telem = PacketHeader(
            packet_format=2024,
            game_year=24,
            game_major_version=1,
            game_minor_version=18,
            packet_version=1,
            packet_id=PACKET_ID_CAR_TELEMETRY,
            session_uid=123456789012345678,
            session_time=self.session_time,
            frame_identifier=self.frame_id,
            overall_frame_identifier=self.frame_id,
            player_car_index=self.player_index,
            secondary_player_car_index=255,
        )
        
        player_car = PlayerTelemetryData(
            speed=int(self.speed),
            throttle=float(self.throttle),
            steer=float(self.steer),
            brake=float(self.brake),
            clutch=0,
            gear=int(self.gear),
            engine_rpm=int(self.rpm),
            drs=int(self.drs),
            rev_lights_percent=int(min(100, max(0, (self.rpm - 8000) / (self.max_rpm - 8000) * 100))),
            rev_lights_bit_value=0,
            brakes_temperature=(self.brake_temps[0], self.brake_temps[1], self.brake_temps[2], self.brake_temps[3]),
            tyres_surface_temperature=(self.tyre_temps[0], self.tyre_temps[1], self.tyre_temps[2], self.tyre_temps[3]),
            tyres_inner_temperature=(self.tyre_temps[0] + 5, self.tyre_temps[1] + 5, self.tyre_temps[2] + 5, self.tyre_temps[3] + 5),
            engine_temperature=102,
            tyres_pressure=(23.5, 23.5, 22.8, 22.8),
            surface_type=(0, 0, 0, 0),
        )
        
        # Fill grid (22 cars)
        cars_telem = [player_car if i == self.player_index else player_car for i in range(NUM_CARS)]
        packet_telem_bytes = pack_full_telemetry_packet(header_telem, cars_telem)

        # Status packet
        header_status = PacketHeader(
            packet_format=2024,
            game_year=24,
            game_major_version=1,
            game_minor_version=18,
            packet_version=1,
            packet_id=PACKET_ID_CAR_STATUS,
            session_uid=123456789012345678,
            session_time=self.session_time,
            frame_identifier=self.frame_id,
            overall_frame_identifier=self.frame_id,
            player_car_index=self.player_index,
            secondary_player_car_index=255,
        )
        
        player_status = PlayerStatusData(
            max_rpm=self.max_rpm,
            idle_rpm=4000,
            max_gears=8,
            drs_allowed=self.drs_allowed,
            drs_activation_distance=0 if self.drs_allowed else 150,
            ers_store_energy=float(self.ers_store_energy),
            ers_deploy_mode=self.ers_deploy_mode,
            fuel_in_tank=25.4,
            fuel_capacity=110.0,
            fuel_remaining_laps=14.2,
        )
        cars_status = [player_status if i == self.player_index else player_status for i in range(NUM_CARS)]
        packet_status_bytes = pack_full_status_packet(header_status, cars_status)

        return packet_telem_bytes, packet_status_bytes


def run_producer(
    host: str = "127.0.0.1",
    port: int = 20777,
    frequency_hz: float = 60.0,
    max_packets: Optional[int] = None,
    print_logs: bool = True,
):
    """Synchronous/standard socket runner for 60Hz UDP emission."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sim = MockTelemetrySimulator(host, port)
    dt = 1.0 / frequency_hz
    sent_count = 0

    if print_logs:
        print(f"[MockProducer] Streaming F1 24 telemetry to {host}:{port} @ {frequency_hz}Hz (dt={dt*1000:.2f}ms)...")

    try:
        while max_packets is None or sent_count < max_packets:
            start_t = time.perf_counter()
            telem_bytes, status_bytes = sim.generate_packets(dt)
            
            sock.sendto(telem_bytes, (host, port))
            # Send status every 3rd frame or each frame (20Hz to 60Hz)
            if sent_count % 3 == 0:
                sock.sendto(status_bytes, (host, port))
                
            sent_count += 1
            elapsed = time.perf_counter() - start_t
            sleep_time = max(0.0, dt - elapsed)
            time.sleep(sleep_time)
            
            if print_logs and sent_count % 180 == 0:
                print(f"[MockProducer] Frame {sent_count} | Speed: {sim.speed:3.0f} km/h | Gear: {sim.gear} | RPM: {sim.rpm:5d} | DRS: {sim.drs} | ERS: {sim.ers_store_energy/1e6:.2f}MJ")
    except KeyboardInterrupt:
        if print_logs:
            print("\n[MockProducer] Stopped by user.")
    finally:
        sock.close()


async def run_producer_async(
    host: str = "127.0.0.1",
    port: int = 20777,
    frequency_hz: float = 60.0,
    duration_seconds: Optional[float] = None,
):
    """Async runner used directly inside asyncio test harnesses."""
    loop = asyncio.get_running_loop()
    transport, _ = await loop.create_datagram_endpoint(
        lambda: asyncio.DatagramProtocol(),
        remote_addr=(host, port),
    )
    sim = MockTelemetrySimulator(host, port)
    dt = 1.0 / frequency_hz
    start_time = time.perf_counter()
    sent_count = 0

    try:
        while duration_seconds is None or (time.perf_counter() - start_time) < duration_seconds:
            t0 = time.perf_counter()
            telem_bytes, status_bytes = sim.generate_packets(dt)
            transport.sendto(telem_bytes)
            if sent_count % 3 == 0:
                transport.sendto(status_bytes)
            sent_count += 1
            
            t1 = time.perf_counter()
            sleep_t = max(0.0, dt - (t1 - t0))
            await asyncio.sleep(sleep_t)
    finally:
        transport.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="F1 24 Mock Telemetry UDP Producer")
    parser.add_argument("--host", default="127.0.0.1", help="Target host")
    parser.add_argument("--port", type=int, default=20777, help="Target UDP port")
    parser.add_argument("--hz", type=float, default=60.0, help="Packet frequency in Hz")
    parser.add_argument("--count", type=int, default=None, help="Stop after N packets (None=infinite)")
    args = parser.parse_args()
    
    run_producer(args.host, args.port, args.hz, args.count)
