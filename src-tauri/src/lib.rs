use tauri::Manager;

#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::HWND;
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT,
};

/// Win32 helper: Injects WS_EX_TRANSPARENT and WS_EX_LAYERED into window HWND.
/// WS_EX_TRANSPARENT ensures mouse events fall through completely to the underlying game.
/// WS_EX_LAYERED ensures alpha compositing without black background artifacts.
#[tauri::command]
pub fn set_click_through(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            let raw_hwnd = hwnd.0 as isize;
            unsafe {
                let initial_style = GetWindowLongW(raw_hwnd as HWND, GWL_EXSTYLE);
                let new_style = initial_style | (WS_EX_TRANSPARENT as i32) | (WS_EX_LAYERED as i32);
                SetWindowLongW(raw_hwnd as HWND, GWL_EXSTYLE, new_style);
            }
            return Ok(());
        }
        return Err("Failed to obtain window HWND".into());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
        Ok(())
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(hwnd) = window.hwnd() {
                        let raw_hwnd = hwnd.0 as isize;
                        unsafe {
                            let initial_style = GetWindowLongW(raw_hwnd as HWND, GWL_EXSTYLE);
                            let new_style = initial_style | (WS_EX_TRANSPARENT as i32) | (WS_EX_LAYERED as i32);
                            SetWindowLongW(raw_hwnd as HWND, GWL_EXSTYLE, new_style);
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![set_click_through])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
