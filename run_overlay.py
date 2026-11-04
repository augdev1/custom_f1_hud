"""
F1 24 Custom HUD - Ultra-light Interactive Widget Overlay
Size: 860x165 floating dashboard.
True Win32 DWM hardware transparency with zero white border.
Press F8 or click Travar to lock into Race Mode (click-through).
"""

import os
import sys
import json
import time
import ctypes
from threading import Thread
import webview

GWL_EXSTYLE = -20
WS_EX_TOPMOST = 0x00000008
WS_EX_LAYERED = 0x00080000
WS_EX_TRANSPARENT = 0x00000020
WS_EX_TOOLWINDOW = 0x00000080
WS_EX_NOACTIVATE = 0x08000000
LWA_COLORKEY = 0x00000001
LWA_ALPHA = 0x00000002
VK_F8 = 0x77

GWLP_HWNDPARENT = -8
HWND_TOPMOST = -1
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOACTIVATE = 0x0010
SWP_SHOWWINDOW = 0x0040
SWP_FRAMECHANGED = 0x0020

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32
dwmapi = ctypes.windll.dwmapi

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hud_position.json")

HUD_WIDTH = 916
HUD_HEIGHT = 180

is_clickthrough_active = False
app_window = None


def find_f1_game_hwnd():
    """Finds F1 24 game window handle across active desktop windows."""
    f1_hwnd = user32.FindWindowW("EGO_WindowClass", None)
    if f1_hwnd and user32.IsWindow(f1_hwnd):
        return f1_hwnd

    res = []
    def enum_cb(h, lparam):
        class_buf = ctypes.create_unicode_buffer(128)
        user32.GetClassNameW(h, class_buf, 128)
        if class_buf.value == "EGO_WindowClass":
            res.append(h)
            return False
        title_buf = ctypes.create_unicode_buffer(128)
        user32.GetWindowTextW(h, title_buf, 128)
        if "f1" in title_buf.value.lower() and "24" in title_buf.value:
            res.append(h)
            return False
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    hdesk = user32.OpenInputDesktop(0, False, 0x0001 | 0x0040)
    if hdesk:
        user32.EnumDesktopWindows(hdesk, WNDENUMPROC(enum_cb), 0)
        user32.CloseDesktop(hdesk)
    else:
        user32.EnumWindows(WNDENUMPROC(enum_cb), 0)

    return res[0] if res else None


class MARGINS(ctypes.Structure):
    _fields_ = [
        ("cxLeftWidth", ctypes.c_int),
        ("cxRightWidth", ctypes.c_int),
        ("cyTopHeight", ctypes.c_int),
        ("cyBottomHeight", ctypes.c_int),
    ]


def get_overlay_hwnd():
    if app_window:
        native = getattr(app_window, "native", None)
        if native and hasattr(native, "Handle"):
            try:
                return int(native.Handle.ToString())
            except Exception:
                pass
        try:
            h = getattr(app_window, "native_handle", None) or getattr(app_window, "hwnd", None)
            if h:
                return int(h)
        except Exception:
            pass
    hwnd = user32.FindWindowW(None, "F1 24 Live HUD Overlay")
    if hwnd:
        return hwnd
    return None


def configure_window_transparency(hwnd, clickthrough=False):
    """
    Applies DWM Frame Extension, HWND_TOPMOST, and Layered Chroma Key + Alpha Blending.
    Guarantees 100% transparent background outside the HUD chassis with ZERO white borders,
    renders 20px rounded corners with translucent glassmorphism,
    and forces the window to stay strictly superimposed on top of F1 24 in Borderless Windowed mode.
    """
    if not hwnd:
        return

    try:
        # 1. DWM Extended Frame for complete client-area transparency
        margins = MARGINS(-1, -1, -1, -1)
        dwmapi.DwmExtendFrameIntoClientArea(hwnd, ctypes.byref(margins))
    except Exception:
        pass

    try:
        # 2. Window Extended Styles: TOPMOST + LAYERED + TOOLWINDOW + NOACTIVATE (+ TRANSPARENT when clickthrough)
        initial = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        flags = initial | WS_EX_TOPMOST | WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE
        if clickthrough:
            flags |= WS_EX_TRANSPARENT
        else:
            flags &= ~WS_EX_TRANSPARENT

        user32.SetWindowLongW(hwnd, GWL_EXSTYLE, flags)

        # 3. Chroma Key (Black 0x00000000 is 100% transparent) + Alpha (235 for translucent glass)
        user32.SetLayeredWindowAttributes(hwnd, 0x00000000, 235, LWA_COLORKEY | LWA_ALPHA)

        # 4. Attach Ownership to F1 24 if running (Owned windows stay strictly above owner)
        f1_hwnd = find_f1_game_hwnd()
        if f1_hwnd and user32.IsWindow(f1_hwnd):
            user32.SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, f1_hwnd)

        # 5. Immediate Z-Order reinforcement to HWND_TOPMOST
        user32.SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED
        )
    except Exception:
        pass


def load_saved_position(screen_w, screen_h):
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                data = json.load(f)
                x = data.get("x")
                y = data.get("y")
                if x is not None and y is not None:
                    x = max(0, min(screen_w - HUD_WIDTH, int(x)))
                    y = max(0, min(screen_h - HUD_HEIGHT, int(y)))
                    return x, y
        except Exception:
            pass
    # Default: Centered at bottom over the Halo
    default_x = max(0, (screen_w - HUD_WIDTH) // 2)
    default_y = max(0, screen_h - HUD_HEIGHT - 35)
    return default_x, default_y


def save_position(x, y):
    try:
        with open(CONFIG_PATH, "w") as f:
            json.dump({"x": int(x), "y": int(y)}, f)
    except Exception:
        pass


class OverlayAPI:
    def set_clickthrough(self, enabled: bool):
        global is_clickthrough_active
        is_clickthrough_active = enabled
        hwnd = get_overlay_hwnd()
        if hwnd:
            configure_window_transparency(hwnd, clickthrough=enabled)
            if enabled:
                print("[HUD Overlay] MODO CORRIDA ATIVADO: HUD travada e cliques passam direto para o F1 24.")
            else:
                print("[HUD Overlay] MODO MOVER ATIVADO: Clique e arraste para posicionar a HUD onde quiser!")
            return True
        return False

    def center_hud(self):
        screen_w = user32.GetSystemMetrics(0)
        screen_h = user32.GetSystemMetrics(1)
        x = max(0, (screen_w - HUD_WIDTH) // 2)
        y = max(0, screen_h - HUD_HEIGHT - 35)
        if app_window:
            app_window.move(x, y)
            save_position(x, y)
            return {"x": x, "y": y}
        return None

    def save_current_pos(self):
        if app_window:
            try:
                save_position(app_window.x, app_window.y)
            except Exception:
                pass


def startup_transparency_worker(window):
    """Monitors window initialization and applies Win32 hardware transparency immediately."""
    print("[HUD Overlay] Aguardando inicialização da janela para aplicar transparência...")
    for _ in range(60):
        time.sleep(0.1)
        hwnd = get_overlay_hwnd()
        if hwnd:
            configure_window_transparency(hwnd, clickthrough=is_clickthrough_active)
            print(f"[HUD Overlay] Transparência nativa Win32 (Chroma Key + DWM) aplicada com sucesso! HWND={hwnd}")
            break


def hotkey_listener(window):
    """Monitors F8 key globally to toggle between Move Mode and Race Mode (Click-through)."""
    last_state = False

    while True:
        time.sleep(0.08)
        key_down = bool(user32.GetAsyncKeyState(VK_F8) & 0x8000)
        if key_down and not last_state:
            try:
                window.evaluate_js("window.toggleLock && window.toggleLock()")
            except Exception:
                pass
        last_state = key_down


def position_tracker_worker(window):
    """Periodically saves position when moved."""
    last_pos = (None, None)
    while True:
        time.sleep(1.0)
        try:
            cur_pos = (window.x, window.y)
            if cur_pos != last_pos and cur_pos[0] is not None and cur_pos[1] is not None:
                last_pos = cur_pos
                save_position(cur_pos[0], cur_pos[1])
        except Exception:
            pass


def topmost_watchdog_worker(window):
    """
    Continuously maintains HWND_TOPMOST and F1 24 window ownership at 4Hz (every 250ms).
    Guarantees that when the user clicks inside F1 24 or changes focus, the HUD NEVER drops behind the game.
    """
    while True:
        time.sleep(0.25)
        hwnd = get_overlay_hwnd()
        if hwnd and user32.IsWindow(hwnd):
            try:
                # 1. Maintain F1 24 owner relationship if game is running
                f1_hwnd = find_f1_game_hwnd()
                if f1_hwnd and user32.IsWindow(f1_hwnd):
                    current_parent = user32.GetWindowLongPtrW(hwnd, GWLP_HWNDPARENT)
                    if current_parent != f1_hwnd:
                        user32.SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, f1_hwnd)

                # 2. Reinforce TopMost Z-order continuously
                user32.SetWindowPos(
                    hwnd,
                    HWND_TOPMOST,
                    0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW
                )
            except Exception:
                pass


BACKEND_HOST = os.getenv("HUD_BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = os.getenv("HUD_BACKEND_PORT", "8000")
BACKEND_BASE_URL = os.getenv("HUD_BACKEND_URL", f"http://{BACKEND_HOST}:{BACKEND_PORT}")


def ensure_backend_running():
    """
    Verifies if the telemetry backend is running on the configured host/port (Local or Docker VM).
    If localhost and not running, automatically spawns backend.server as a background process.
    """
    import urllib.request
    health_url = f"{BACKEND_BASE_URL}/health"
    try:
        with urllib.request.urlopen(health_url, timeout=0.8) as r:
            if r.status == 200:
                print(f"[HUD Overlay] Servidor backend de telemetria ativo em {BACKEND_BASE_URL}.")
                return True
    except Exception:
        pass

    # If backend is running externally (e.g. VM / Docker), don't spawn local process
    if BACKEND_HOST not in ("127.0.0.1", "localhost"):
        print(f"[HUD Overlay] Servidor backend em {BACKEND_BASE_URL} não respondeu.")
        print("[HUD Overlay] Verifique se o container Docker na VM VirtualBox está rodando com as portas mapeadas.")
        return False

    print("[HUD Overlay] Servidor backend local não detectado. Iniciando backend.server automaticamente...")
    try:
        import subprocess
        base_dir = os.path.dirname(os.path.abspath(__file__))
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        subprocess.Popen(
            [sys.executable, "-m", "backend.server"],
            cwd=base_dir,
            creationflags=flags
        )
        for _ in range(25):
            time.sleep(0.2)
            try:
                with urllib.request.urlopen(health_url, timeout=0.3) as r:
                    if r.status == 200:
                        print(f"[HUD Overlay] Servidor backend iniciado com sucesso em {BACKEND_BASE_URL}.")
                        return True
            except Exception:
                pass
    except Exception as e:
        print(f"[HUD Overlay] Aviso ao iniciar backend: {e}")
    return False


def main():
    global app_window
    screen_w = user32.GetSystemMetrics(0)
    screen_h = user32.GetSystemMetrics(1)

    init_x, init_y = load_saved_position(screen_w, screen_h)

    print(f"[HUD Overlay] Iniciando HUD flutuante compacta ({HUD_WIDTH}x{HUD_HEIGHT}) em ({init_x}, {init_y})...")
    print("[HUD Overlay] DICA: Pressione F8 a qualquer momento para TRAVAR ou DESTRAVAR o movimento da HUD!")

    # Check / start backend server automatically
    backend_up = ensure_backend_running()
    overlay_html_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "backend", "static", "overlay.html"))
    overlay_url = f"{BACKEND_BASE_URL}/overlay" if backend_up else f"file:///{overlay_html_file.replace(os.sep, '/')}"

    api = OverlayAPI()

    app_window = webview.create_window(
        title="F1 24 Live HUD Overlay",
        url=overlay_url,
        x=init_x,
        y=init_y,
        width=HUD_WIDTH,
        height=HUD_HEIGHT,
        frameless=True,
        on_top=True,
        resizable=False,
        easy_drag=True,
        transparent=True,
        background_color="#000000",
        js_api=api,
    )

    Thread(target=startup_transparency_worker, args=(app_window,), daemon=True).start()
    Thread(target=topmost_watchdog_worker, args=(app_window,), daemon=True).start()
    Thread(target=hotkey_listener, args=(app_window,), daemon=True).start()
    Thread(target=position_tracker_worker, args=(app_window,), daemon=True).start()
    webview.start(debug=False)


if __name__ == "__main__":
    main()
