import React, { useEffect } from 'react';
import { HudOverlay } from './components/HudOverlay';

export function App() {
  useEffect(() => {
    // Attempt Win32 click-through setup if running within Tauri desktop shell
    const setupTauriOverlay = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_click_through');
      } catch {
        // Running in standard browser or dev preview mode
      }
    };
    setupTauriOverlay();
  }, []);

  return (
    <main className="w-screen h-screen overflow-hidden bg-transparent">
      <HudOverlay />
    </main>
  );
}

export default App;
