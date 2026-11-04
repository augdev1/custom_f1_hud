import React, { forwardRef, useImperativeHandle, useRef } from 'react';

export interface RpmBarHandle {
  update: (rpm: number, maxRpm: number) => void;
}

const TOTAL_LEDS = 15;

export const RpmBar = forwardRef<RpmBarHandle>((_, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rpmTextRef = useRef<HTMLSpanElement>(null);
  const ledsRef = useRef<(HTMLDivElement | null)[]>([]);

  useImperativeHandle(ref, () => ({
    update: (rpm: number, maxRpm: number) => {
      if (rpmTextRef.current) {
        rpmTextRef.current.textContent = `${rpm} RPM`;
      }

      // Calculate rev progress between 60% and 100% of max RPM (F1 rev lights range)
      const minRpm = maxRpm * 0.62;
      const progress = Math.max(0, Math.min(1, (rpm - minRpm) / (maxRpm - minRpm)));
      const activeCount = Math.floor(progress * TOTAL_LEDS);
      const isShiftPoint = progress >= 0.96;

      for (let i = 0; i < TOTAL_LEDS; i++) {
        const led = ledsRef.current[i];
        if (!led) continue;

        if (isShiftPoint) {
          // Shift point alert: all LEDs flash purple
          led.className = "flex-1 h-3 rounded-sm transition-none led-active-purple animate-pulse";
        } else if (i < activeCount) {
          // LED segments: 0-4 Green, 5-9 Red, 10-14 Purple
          if (i < 5) {
            led.className = "flex-1 h-3 rounded-sm transition-none led-active-green";
          } else if (i < 10) {
            led.className = "flex-1 h-3 rounded-sm transition-none led-active-red";
          } else {
            led.className = "flex-1 h-3 rounded-sm transition-none led-active-purple";
          }
        } else {
          led.className = "flex-1 h-3 rounded-sm transition-none led-inactive";
        }
      }
    }
  }));

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center">
      <div className="w-full flex justify-between items-center mb-1 text-[11px] font-mono uppercase text-gray-400 font-bold tracking-wider">
        <span>RPM</span>
        <span ref={rpmTextRef} className="text-white font-mono font-bold">0 RPM</span>
        <span>REDLINE</span>
      </div>
      
      {/* 15 Segment Shift Lights Bar */}
      <div 
        ref={containerRef}
        className="w-full flex gap-1.5 p-1.5 bg-black/60 backdrop-blur-md rounded-md border border-white/10"
      >
        {Array.from({ length: TOTAL_LEDS }).map((_, i) => (
          <div
            key={i}
            ref={(el) => (ledsRef.current[i] = el)}
            className="flex-1 h-3 rounded-sm led-inactive"
          />
        ))}
      </div>
    </div>
  );
});
