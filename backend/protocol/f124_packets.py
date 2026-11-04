"""
F1 24 Telemetry Protocol - Binary Packet Deserialization & Serialization
Compliant with EA/Codemasters F1 24 Telemetry Specification.
Provides zero-copy / direct-slice unpacking for sub-millisecond latency.
"""

from __future__ import annotations
import struct
from dataclasses import dataclass
from typing import List, Tuple, Optional

# --- CONSTANTS & FORMATS (LITTLE-ENDIAN '<') ---
HEADER_FORMAT = "<HBBBBBQfIIBB"
HEADER_SIZE = struct.calcsize(HEADER_FORMAT)  # 29 bytes

# Packet IDs
PACKET_ID_CAR_TELEMETRY = 6
PACKET_ID_CAR_STATUS = 7

# Number of cars on the grid
NUM_CARS = 22

# Single Car Telemetry: 60 bytes
# speed(H), throttle(f), steer(f), brake(f), clutch(B), gear(b), engineRPM(H),
# drs(B), revLightsPercent(B), revLightsBitValue(H), brakesTemp(4H),
# tyresSurfaceTemp(4B), tyresInnerTemp(4B), engineTemp(H), tyresPressure(4f), surfaceType(4B)
CAR_TELEMETRY_DATA_FORMAT = "<HfffBbHBBH4H4B4BH4f4B"
CAR_TELEMETRY_DATA_SIZE = struct.calcsize(CAR_TELEMETRY_DATA_FORMAT)  # 60 bytes
CAR_TELEMETRY_PACKET_TOTAL_SIZE = HEADER_SIZE + (NUM_CARS * CAR_TELEMETRY_DATA_SIZE) + 3  # 1352 bytes

# Single Car Status: 55 bytes
# tractionControl(B), antiLockBrakes(B), fuelMix(B), frontBrakeBias(B), pitLimiterStatus(B),
# fuelInTank(f), fuelCapacity(f), fuelRemainingLaps(f), maxRPM(H), idleRPM(H),
# maxGears(B), drsAllowed(B), drsActivationDistance(H), actualTyreCompound(B),
# visualTyreCompound(B), tyresAgeLaps(B), vehicleFiaFlags(b), enginePowerICE(f),
# enginePowerMGUK(f), ersStoreEnergy(f), ersDeployMode(B), ersHarvestedMGUK(f),
# ersHarvestedMGUH(f), ersDeployedThisLap(f), networkPaused(B)
CAR_STATUS_DATA_FORMAT = "<5B3f2H2BH4B3fB3fB"
CAR_STATUS_DATA_SIZE = struct.calcsize(CAR_STATUS_DATA_FORMAT)  # 55 bytes
CAR_STATUS_PACKET_TOTAL_SIZE = HEADER_SIZE + (NUM_CARS * CAR_STATUS_DATA_SIZE)  # 1239 bytes


@dataclass(slots=True)
class PacketHeader:
    packet_format: int             # uint16 (2024)
    game_year: int                 # uint8 (24)
    game_major_version: int        # uint8
    game_minor_version: int        # uint8
    packet_version: int            # uint8
    packet_id: int                 # uint8
    session_uid: int               # uint64
    session_time: float            # float (seconds)
    frame_identifier: int          # uint32
    overall_frame_identifier: int  # uint32
    player_car_index: int          # uint8
    secondary_player_car_index: int # uint8

    @classmethod
    def unpack(cls, buffer: bytes) -> PacketHeader:
        if len(buffer) < HEADER_SIZE:
            raise ValueError(f"Buffer too short for Header: {len(buffer)} < {HEADER_SIZE}")
        fields = struct.unpack_from(HEADER_FORMAT, buffer, 0)
        return cls(*fields)

    def pack(self) -> bytes:
        return struct.pack(
            HEADER_FORMAT,
            self.packet_format,
            self.game_year,
            self.game_major_version,
            self.game_minor_version,
            self.packet_version,
            self.packet_id,
            self.session_uid,
            self.session_time,
            self.frame_identifier,
            self.overall_frame_identifier,
            self.player_car_index,
            self.secondary_player_car_index,
        )


@dataclass(slots=True)
class PlayerTelemetryData:
    speed: int                        # km/h (uint16)
    throttle: float                   # 0.0 to 1.0 (float)
    steer: float                      # -1.0 to 1.0 (float)
    brake: float                      # 0.0 to 1.0 (float)
    clutch: int                       # 0 to 100 (uint8)
    gear: int                         # -1=R, 0=N, 1..8 (int8)
    engine_rpm: int                   # RPM (uint16)
    drs: int                          # 0=off, 1=on (uint8)
    rev_lights_percent: int           # 0..100 (uint8)
    rev_lights_bit_value: int         # bit field (uint16)
    brakes_temperature: Tuple[int, int, int, int]         # [RL, RR, FL, FR] Celsius
    tyres_surface_temperature: Tuple[int, int, int, int]  # [RL, RR, FL, FR] Celsius
    tyres_inner_temperature: Tuple[int, int, int, int]    # [RL, RR, FL, FR] Celsius
    engine_temperature: int           # Celsius (uint16)
    tyres_pressure: Tuple[float, float, float, float]     # [RL, RR, FL, FR] PSI
    surface_type: Tuple[int, int, int, int]               # [RL, RR, FL, FR]


@dataclass(slots=True)
class PlayerStatusData:
    max_rpm: int                      # RPM redline limit (uint16)
    idle_rpm: int                     # Idle RPM (uint16)
    max_gears: int                    # Max gears (uint8)
    drs_allowed: int                  # 0=not allowed, 1=allowed (uint8)
    drs_activation_distance: int       # meters (uint16)
    ers_store_energy: float           # Joules (float32, max 4,000,000 J)
    ers_deploy_mode: int              # 0=None, 1=Medium, 2=Hotlap, 3=Overtake (uint8)
    fuel_in_tank: float               # kg (float)
    fuel_capacity: float              # kg (float)
    fuel_remaining_laps: float        # Laps (float)


def unpack_player_telemetry(buffer: bytes, player_car_index: Optional[int] = None) -> Tuple[PacketHeader, PlayerTelemetryData]:
    """
    Direct-slice high performance unpacker for Player Car Telemetry (Packet ID 6).
    Avoids unpacking all 22 cars to ensure microsecond execution in the 60Hz loop.
    """
    if len(buffer) < HEADER_SIZE:
        raise ValueError(f"Buffer underflow: length {len(buffer)} < {HEADER_SIZE}")
    
    header = PacketHeader.unpack(buffer)
    if header.packet_id != PACKET_ID_CAR_TELEMETRY:
        raise ValueError(f"Invalid packet_id {header.packet_id}, expected {PACKET_ID_CAR_TELEMETRY}")

    idx = header.player_car_index if player_car_index is None else player_car_index
    if not (0 <= idx < NUM_CARS):
        idx = 0  # Fallback to first car slot if player index is unassigned (255)

    offset = HEADER_SIZE + (idx * CAR_TELEMETRY_DATA_SIZE)
    if len(buffer) < offset + CAR_TELEMETRY_DATA_SIZE:
        raise ValueError(f"Buffer underflow for car index {idx}: need {offset + CAR_TELEMETRY_DATA_SIZE} bytes")

    raw = struct.unpack_from(CAR_TELEMETRY_DATA_FORMAT, buffer, offset)
    
    # Fields mapping:
    # 0: speed, 1: throttle, 2: steer, 3: brake, 4: clutch, 5: gear, 6: engine_rpm,
    # 7: drs, 8: rev_lights_percent, 9: rev_lights_bit_value,
    # 10..13: brakes_temp (4), 14..17: tyres_surf_temp (4), 18..21: tyres_inner_temp (4),
    # 22: engine_temp, 23..26: tyres_pressure (4), 27..30: surface_type (4)
    telemetry = PlayerTelemetryData(
        speed=raw[0],
        throttle=raw[1],
        steer=raw[2],
        brake=raw[3],
        clutch=raw[4],
        gear=raw[5],
        engine_rpm=raw[6],
        drs=raw[7],
        rev_lights_percent=raw[8],
        rev_lights_bit_value=raw[9],
        brakes_temperature=(raw[10], raw[11], raw[12], raw[13]),
        tyres_surface_temperature=(raw[14], raw[15], raw[16], raw[17]),
        tyres_inner_temperature=(raw[18], raw[19], raw[20], raw[21]),
        engine_temperature=raw[22],
        tyres_pressure=(raw[23], raw[24], raw[25], raw[26]),
        surface_type=(raw[27], raw[28], raw[29], raw[30]),
    )
    return header, telemetry


def unpack_player_status(buffer: bytes, player_car_index: Optional[int] = None) -> Tuple[PacketHeader, PlayerStatusData]:
    """
    Direct-slice high performance unpacker for Player Car Status (Packet ID 7).
    """
    if len(buffer) < HEADER_SIZE:
        raise ValueError(f"Buffer underflow: length {len(buffer)} < {HEADER_SIZE}")
    
    header = PacketHeader.unpack(buffer)
    if header.packet_id != PACKET_ID_CAR_STATUS:
        raise ValueError(f"Invalid packet_id {header.packet_id}, expected {PACKET_ID_CAR_STATUS}")

    idx = header.player_car_index if player_car_index is None else player_car_index
    if not (0 <= idx < NUM_CARS):
        idx = 0  # Fallback to first car slot if unassigned

    offset = HEADER_SIZE + (idx * CAR_STATUS_DATA_SIZE)
    if len(buffer) < offset + CAR_STATUS_DATA_SIZE:
        raise ValueError(f"Buffer underflow for status car index {idx}: need {offset + CAR_STATUS_DATA_SIZE} bytes")

    raw = struct.unpack_from(CAR_STATUS_DATA_FORMAT, buffer, offset)
    
    # Raw unpack indices:
    # 0: tractionControl, 1: antiLockBrakes, 2: fuelMix, 3: frontBrakeBias, 4: pitLimiterStatus
    # 5: fuelInTank, 6: fuelCapacity, 7: fuelRemainingLaps
    # 8: maxRPM, 9: idleRPM, 10: maxGears, 11: drsAllowed, 12: drsActivationDistance
    # 13: actualTyreCompound, 14: visualTyreCompound, 15: tyresAgeLaps, 16: vehicleFiaFlags
    # 17: enginePowerICE, 18: enginePowerMGUK, 19: ersStoreEnergy, 20: ersDeployMode
    # 21: ersHarvestedMGUK, 22: ersHarvestedMGUH, 23: ersDeployedThisLap, 24: networkPaused
    status = PlayerStatusData(
        max_rpm=raw[8],
        idle_rpm=raw[9],
        max_gears=raw[10],
        drs_allowed=raw[11],
        drs_activation_distance=raw[12],
        ers_store_energy=raw[19],
        ers_deploy_mode=raw[20],
        fuel_in_tank=raw[5],
        fuel_capacity=raw[6],
        fuel_remaining_laps=raw[7],
    )
    return header, status


def pack_full_telemetry_packet(header: PacketHeader, cars_data: List[PlayerTelemetryData], mfd: Tuple[int, int, int] = (255, 255, 0)) -> bytes:
    """Helper to assemble a valid 1352-byte F1 24 Telemetry Packet for tests & mock producer."""
    buf = bytearray(header.pack())
    for car in cars_data:
        car_bytes = struct.pack(
            CAR_TELEMETRY_DATA_FORMAT,
            car.speed,
            car.throttle,
            car.steer,
            car.brake,
            car.clutch,
            car.gear,
            car.engine_rpm,
            car.drs,
            car.rev_lights_percent,
            car.rev_lights_bit_value,
            *car.brakes_temperature,
            *car.tyres_surface_temperature,
            *car.tyres_inner_temperature,
            car.engine_temperature,
            *car.tyres_pressure,
            *car.surface_type,
        )
        buf.extend(car_bytes)
    # Append trailing MFD bytes: mfdPanelIndex(B), mfdPanelIndexSecondaryPlayer(B), suggestedGear(b)
    buf.extend(struct.pack("<BBb", mfd[0], mfd[1], mfd[2]))
    return bytes(buf)


def pack_full_status_packet(header: PacketHeader, cars_status: List[PlayerStatusData]) -> bytes:
    """Helper to assemble a valid 1239-byte F1 24 Status Packet for tests & mock producer."""
    buf = bytearray(header.pack())
    for s in cars_status:
        car_bytes = struct.pack(
            CAR_STATUS_DATA_FORMAT,
            0, 0, 1, 56, 0,                   # tc, abs, fuelMix, frontBrakeBias, pitLimiter
            s.fuel_in_tank, s.fuel_capacity, s.fuel_remaining_laps,
            s.max_rpm, s.idle_rpm, s.max_gears, s.drs_allowed, s.drs_activation_distance,
            16, 16, 3, 0,                     # actualTyre, visualTyre, tyresAge, fiaFlags
            500000.0, 120000.0,               # enginePowerICE, enginePowerMGUK
            s.ers_store_energy, s.ers_deploy_mode,
            50000.0, 20000.0, 100000.0,       # harvestedMGUK, harvestedMGUH, deployedThisLap
            0                                 # networkPaused
        )
        buf.extend(car_bytes)
    return bytes(buf)
