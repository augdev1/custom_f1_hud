"""
Shell Config & Static Validation Tests: Tauri Overlay Settings & Win32 Flags
Guarantees transparent, frameless, click-through overlay settings before compile time.
"""

import json
from pathlib import Path
import pytest

TAURI_CONF_PATH = Path(__file__).resolve().parent.parent.parent / "src-tauri" / "tauri.conf.json"
CARGO_TOML_PATH = Path(__file__).resolve().parent.parent.parent / "src-tauri" / "Cargo.toml"
RUST_SRC_PATH = Path(__file__).resolve().parent.parent.parent / "src-tauri" / "src" / "lib.rs"


def test_tauri_config_overlay_flags():
    """Validates critical Tauri v2 overlay window settings in tauri.conf.json."""
    assert TAURI_CONF_PATH.exists(), f"tauri.conf.json not found at {TAURI_CONF_PATH}"

    with open(TAURI_CONF_PATH, "r", encoding="utf-8") as f:
        conf = json.load(f)

    # In Tauri v2, window configs are located under app.windows array
    windows = conf.get("app", {}).get("windows", [])
    assert len(windows) > 0, "No windows defined in tauri.conf.json"

    main_win = windows[0]
    
    # 1. Transparent background
    assert main_win.get("transparent") is True, "Window flag 'transparent' must be true for overlay HUD"

    # 2. Borderless / Frameless
    assert main_win.get("decorations") is False, "Window flag 'decorations' must be false"

    # 3. Always On Top
    assert main_win.get("alwaysOnTop") is True, "Window flag 'alwaysOnTop' must be true to stay above F1 24"

    # 4. Shadow disabled (prevents square halo on transparent windows)
    assert main_win.get("shadow") is False, "Window flag 'shadow' must be false to avoid transparent window artifacting"


def test_cargo_toml_windows_sys_dependency():
    """Validates that Cargo.toml includes windows-sys with Win32 UI and Foundation features."""
    assert CARGO_TOML_PATH.exists(), f"Cargo.toml not found at {CARGO_TOML_PATH}"
    content = CARGO_TOML_PATH.read_text(encoding="utf-8")

    assert "windows-sys" in content, "Cargo.toml must include windows-sys for native Win32 window manipulation"
    assert "Win32_UI_WindowsAndMessaging" in content, "windows-sys must include Win32_UI_WindowsAndMessaging feature"
    assert "Win32_Foundation" in content, "windows-sys must include Win32_Foundation feature"


def test_rust_win32_clickthrough_injection():
    """Validates that Rust window setup injects WS_EX_TRANSPARENT and WS_EX_LAYERED."""
    assert RUST_SRC_PATH.exists(), f"lib.rs not found at {RUST_SRC_PATH}"
    src_content = RUST_SRC_PATH.read_text(encoding="utf-8")

    # Ensure Win32 constants are used
    assert "WS_EX_TRANSPARENT" in src_content, "Missing WS_EX_TRANSPARENT in Rust window setup"
    assert "WS_EX_LAYERED" in src_content, "Missing WS_EX_LAYERED in Rust window setup"
    assert "SetWindowLongW" in src_content or "SetWindowLongPtrW" in src_content, "Missing SetWindowLong Win32 call"
    assert "GWL_EXSTYLE" in src_content, "Missing GWL_EXSTYLE target in Rust window setup"
