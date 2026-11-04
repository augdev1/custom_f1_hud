import React, { forwardRef, useImperativeHandle, useRef } from 'react';

export interface GearSpeedHandle {
  update: (speed: number, gear: number, throttle: number, brake: number) => void;
}

export const GearSpeedDisplay = forwardRef<GearSpeedHandle>((_, ref) => {
  const speedRef = useRef<HTMLSpanElement>(null);
  const gearRef = useRef<HTMLSpanElement>(null);
  const throttleBarRef = useRef<HTMLDivElement>(null);
  const brakeBarRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    update: (speed: number, gear: number, throttle: number, brake: number) => {
      // Speed update
      if (speedRef.current) {
        speedRef.current.textContent = speed.toString().padStart(3, ' ');
      }

      // Gear update
      if (gearRef.current) {
        if (gear === 0) {
          gearRef.current.textContent = 'N';
          gearRef.current.className = "text-7xl font-extrabold font-display text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.6)]";
        } else if (gear === -1) {
          gearRef.current.textContent = 'R';
          gearRef.current.className = "text-7xl font-extrabold font-display text-f1-red drop-shadow-[0_0_15px_rgba(225,6,0,0.6)]";
        } else {
          gearRef.current.textContent = gear.toString();
          gearRef.current.className = "text-7xl font-extrabold font-display text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]";
        }
      }

      // Pedal inputs (0.0 to 1.0)
      if (throttleBarRef.current) {
        const throttlePct = Math.min(100, Math.max(0, throttle * 100));
        throttleBarRef.current.style.height = `${throttlePct}%`;
      }
      if (brakeBarRef.current) {
        const brakePct = Math.min(100, Math.max(0, brake * 100));
        brakeBarRef.current.style.height = `${brakePct}%`;
      }
    }
  }));

  return (
    <div className="hud-glass rounded-xl p-4 flex items-center justify-between gap-6 border border-white/10 shadow-2xl">
      {/* Brake Pedal Bar */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] font-mono font-bold text-red-400 tracking-wider">BRK</span>
        <div className="w-2.5 h-20 bg-white/10 rounded-full overflow-hidden flex flex-col justify-end p-0.5">
          <div
            ref={brakeBarRef}
            className="w-full bg-red-500 rounded-full transition-none shadow-glow-red"
            style={{ height: '0%' }}
          />
        </div>
      </div>

      {/* Main Gear Display */}
      <div className="flex flex-col items-center justify-center min-w-[90px]">
        <span className="text-[10px] font-mono font-bold text-gray-400 tracking-widest uppercase">GEAR</span>
        <span
          ref={gearRef}
          className="text-7xl font-extrabold font-display text-yellow-400 select-none"
        >
          N
        </span>
      </div>

      {/* Speedometer */}
      <div className="flex flex-col items-end min-w-[120px]">
        <div className="flex items-baseline">
          <span
            ref={speedRef}
            className="text-6xl font-extrabold font-display text-white tracking-tight"
          >
            0
          </span>
          <span className="text-xs font-mono font-bold text-gray-400 ml-1.5 uppercase">KM/H</span>
        </div>
        <div className="text-[10px] font-mono text-cyan-400/80 font-semibold tracking-wider">
          LIVE VELOCITY
        </div>
      </div>

      {/* Throttle Pedal Bar */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] font-mono font-bold text-green-400 tracking-wider">THR</span>
        <div className="w-2.5 h-20 bg-white/10 rounded-full overflow-hidden flex flex-col justify-end p-0.5">
          <div
            ref={throttleBarRef}
            className="w-full bg-green-500 rounded-full transition-none shadow-glow-green"
            style={{ height: '0%' }}
          />
        </div>
      </div>
    </div>
  );
});
