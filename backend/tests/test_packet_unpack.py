"""
Unit Tests: Binary Packet Deserialization & Little-Endian Validation
Tests F1 24 Telemetry & Status unpacker functions with known raw binary fixtures.
"""

import pytest
import struct
from backend.protocol.f124_packets import (
    PacketHeader,
    PlayerTelemetryData,
    PlayerStatusData,
    unpack_player_telemetry,
    unpack_player_status,
    pack_full_telemetry_packet,
    pack_full_status_packet,
    HEADER_SIZE,
    CAR_TELEMETRY_DATA_SIZE,
    CAR_STATUS_DATA_SIZE,
    PACKET_ID_CAR_TELEMETRY,
    PACKET_ID_CAR_STATUS,
    NUM_CARS,
)


def test_header_unpacking_and_little_endian():
    """Validates that PacketHeader unpacks Little-endian fields accurately."""
    # Construct 29-byte Header:
    # packetFormat=2024 (0x07E8 -> \xe8\x07)
    # gameYear=24, major=1, minor=18, version=1, packetId=6
    # sessionUid=0x0102030405060708
    # sessionTime=12.5f
    # frameId=1000, overallFrameId=2000
    # playerCarIndex=3, secondaryPlayerCarIndex=255
    raw_header = struct.pack(
        "<HBBBBBQfIIBB",
        2024, 24, 1, 18, 1, 6,
        0x0102030405060708,
        12.5,
        1000,
        2000,
        3,
        255
    )
    assert len(raw_header) == HEADER_SIZE == 29
    
    header = PacketHeader.unpack(raw_header)
    assert header.packet_format == 2024
    assert header.game_year == 24
    assert header.game_major_version == 1
    assert header.game_minor_version == 18
    assert header.packet_version == 1
    assert header.packet_id == 6
    assert header.session_uid == 0x0102030405060708
    assert pytest.approx(header.session_time, 0.001) == 12.5
    assert header.frame_identifier == 1000
    assert header.overall_frame_identifier == 2000
    assert header.player_car_index == 3
    assert header.secondary_player_car_index == 255


def test_telemetry_unpack_player_index_routing():
    """Ensures playerCarIndex points to the correct car slot in the 22-car array."""
    target_player_index = 4
    header = PacketHeader(
        packet_format=2024,
        game_year=24,
        game_major_version=1,
        game_minor_version=18,
        packet_version=1,
        packet_id=PACKET_ID_CAR_TELEMETRY,
        session_uid=99999,
        session_time=45.2,
        frame_identifier=300,
        overall_frame_identifier=300,
        player_car_index=target_player_index,
        secondary_player_car_index=255,
    )

    cars = []
    for i in range(NUM_CARS):
        # Car i gets distinct speed and gear
        c = PlayerTelemetryData(
            speed=100 + i * 10,
            throttle=0.8,
            steer=-0.1,
            brake=0.0,
            clutch=0,
            gear=i,
            engine_rpm=10000 + i * 100,
            drs=1 if i == target_player_index else 0,
            rev_lights_percent=85,
            rev_lights_bit_value=0,
            brakes_temperature=(400 + i, 401 + i, 402 + i, 403 + i),
            tyres_surface_temperature=(90 + i, 91 + i, 92 + i, 93 + i),
            tyres_inner_temperature=(95, 95, 95, 95),
            engine_temperature=100,
            tyres_pressure=(23.0, 23.0, 23.0, 23.0),
            surface_type=(0, 0, 0, 0),
        )
        cars.append(c)

    packet_bytes = pack_full_telemetry_packet(header, cars)
    assert len(packet_bytes) == HEADER_SIZE + (NUM_CARS * CAR_TELEMETRY_DATA_SIZE) + 3

    # Unpack player telemetry
    hdr_out, telem_out = unpack_player_telemetry(packet_bytes)
    assert hdr_out.player_car_index == target_player_index
    assert telem_out.speed == 100 + target_player_index * 10  # 140 km/h
    assert telem_out.gear == target_player_index               # 4th gear
    assert telem_out.engine_rpm == 10000 + target_player_index * 100
    assert telem_out.drs == 1
    assert telem_out.brakes_temperature == (404, 405, 406, 407)
    assert telem_out.tyres_surface_temperature == (94, 95, 96, 97)


def test_telemetry_negative_gear_reverse_and_neutral():
    """Tests signed int8 gear field: -1 for reverse, 0 for neutral."""
    header = PacketHeader(
        packet_format=2024, game_year=24, game_major_version=1, game_minor_version=18,
        packet_version=1, packet_id=PACKET_ID_CAR_TELEMETRY, session_uid=1,
        session_time=0.1, frame_identifier=1, overall_frame_identifier=1,
        player_car_index=0, secondary_player_car_index=255
    )
    
    rev_car = PlayerTelemetryData(
        speed=15, throttle=0.2, steer=0.0, brake=0.0, clutch=0,
        gear=-1, engine_rpm=5000, drs=0, rev_lights_percent=20, rev_lights_bit_value=0,
        brakes_temperature=(200, 200, 200, 200),
        tyres_surface_temperature=(80, 80, 80, 80),
        tyres_inner_temperature=(85, 85, 85, 85),
        engine_temperature=90, tyres_pressure=(22.0, 22.0, 22.0, 22.0),
        surface_type=(0, 0, 0, 0)
    )
    packet_bytes = pack_full_telemetry_packet(header, [rev_car] * NUM_CARS)
    _, telem = unpack_player_telemetry(packet_bytes)
    assert telem.gear == -1


def test_status_unpack_ers_and_drs():
    """Tests PacketCarStatusData unpacking: ERS energy and DRS permission."""
    header = PacketHeader(
        packet_format=2024, game_year=24, game_major_version=1, game_minor_version=18,
        packet_version=1, packet_id=PACKET_ID_CAR_STATUS, session_uid=2,
        session_time=1.0, frame_identifier=2, overall_frame_identifier=2,
        player_car_index=1, secondary_player_car_index=255
    )

    status_entries = []
    for i in range(NUM_CARS):
        s = PlayerStatusData(
            max_rpm=13500,
            idle_rpm=4200,
            max_gears=8,
            drs_allowed=1 if i == 1 else 0,
            drs_activation_distance=0,
            ers_store_energy=3_456_789.0 if i == 1 else 1_000_000.0,
            ers_deploy_mode=3 if i == 1 else 1,
            fuel_in_tank=30.0,
            fuel_capacity=110.0,
            fuel_remaining_laps=18.5
        )
        status_entries.append(s)

    packet_bytes = pack_full_status_packet(header, status_entries)
    hdr_out, status_out = unpack_player_status(packet_bytes)

    assert hdr_out.player_car_index == 1
    assert status_out.drs_allowed == 1
    assert pytest.approx(status_out.ers_store_energy, 1.0) == 3_456_789.0
    assert status_out.ers_deploy_mode == 3
    assert status_out.max_rpm == 13500


def test_buffer_underflow_and_packet_id_validation():
    """Ensures improper lengths or packet IDs fail gracefully with ValueError."""
    # Truncated header
    with pytest.raises(ValueError, match="Buffer"):
        unpack_player_telemetry(b"\x00" * 20)

    # Wrong packet id (e.g. passing telemetry buffer to status unpacker)
    header = PacketHeader(
        packet_format=2024, game_year=24, game_major_version=1, game_minor_version=18,
        packet_version=1, packet_id=PACKET_ID_CAR_TELEMETRY, session_uid=1,
        session_time=0.1, frame_identifier=1, overall_frame_identifier=1,
        player_car_index=0, secondary_player_car_index=255
    )
    dummy_car = PlayerTelemetryData(
        speed=0, throttle=0, steer=0, brake=0, clutch=0, gear=0, engine_rpm=0,
        drs=0, rev_lights_percent=0, rev_lights_bit_value=0,
        brakes_temperature=(0, 0, 0, 0), tyres_surface_temperature=(0, 0, 0, 0),
        tyres_inner_temperature=(0, 0, 0, 0), engine_temperature=0,
        tyres_pressure=(0, 0, 0, 0), surface_type=(0, 0, 0, 0)
    )
    telem_packet = pack_full_telemetry_packet(header, [dummy_car] * NUM_CARS)
    
    with pytest.raises(ValueError, match="expected 7"):
        unpack_player_status(telem_packet)
