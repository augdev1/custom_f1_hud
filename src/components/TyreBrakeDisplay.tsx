import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Disc, Gauge } from 'lucide-react';

export interface TyreBrakeHandle {
  update: (
    tyreTemps: [number, number, number, number],
    brakeTemps: [number, number, number, number]
  ) => void;
}

// Corner indexes: 0: RL, 1: RR, 2: FL, 3: FR
export const TyreBrakeDisplay = forwardRef<TyreBrakeHandle>((_, ref) => {
  // Tyre surface temp refs: [RL, RR, FL, FR]
  const tyreRefs = [
    useRef<HTMLSpanElement>(null),
    useRef<HTMLSpanElement>(null),
    useRef<HTMLSpanElement>(null),
    useRef<HTMLSpanElement>(null),
  ];

  // Brake disc temp refs: [RL, RR, FL, FR]
  const brakeRefs = [
    useRef<HTMLSpanElement>(null),
    useRef<HTMLSpanElement>(null),
    useRef<HTMLSpanElement>(null),
    useRef<HTMLSpanElement>(null),
  ];

  const getTyreColorClass = (temp: number) => {
    if (temp < 85) return 'text-cyan-400 font-bold';
    if (temp <= 105) return 'text-green-400 font-bold';
    return 'text-red-500 font-extrabold animate-pulse';
  };

  const getBrakeColorClass = (temp: number) => {
    if (temp < 300) return 'text-gray-400';
    if (temp <= 650) return 'text-green-400 font-semibold';
    if (temp <= 800) return 'text-amber-400 font-bold';
    return 'text-red-500 font-extrabold shadow-glow-red animate-pulse';
  };

  useImperativeHandle(ref, () => ({
    update: (tyreTemps, brakeTemps) => {
      for (let i = 0; i < 4; i++) {
        const t = tyreTemps[i];
        const b = brakeTemps[i];
        
        if (tyreRefs[i].current) {
          tyreRefs[i].current!.textContent = `${t}°C`;
          tyreRefs[i].current!.className = `text-xs font-mono ${getTyreColorClass(t)}`;
        }
        if (brakeRefs[i].current) {
          brakeRefs[i].current!.textContent = `${b}°C`;
          brakeRefs[i].current!.className = `text-xs font-mono ${getBrakeColorClass(b)}`;
        }
      }
    }
  }));

  const renderCorner = (index: number, label: string) => (
    <div className="flex flex-col p-1.5 bg-white/[0.04] rounded-lg border border-white/5">
      <div className="flex justify-between items-center text-[9px] font-mono text-gray-400 font-bold mb-1">
        <span>{label}</span>
      </div>
      <div className="flex items-center justify-between text-[10px] gap-2">
        <span className="flex items-center gap-1 text-gray-400" title="Tyre Surface Temperature">
          <Gauge className="w-2.5 h-2.5 text-gray-500" />
          <span ref={tyreRefs[index]} className="text-cyan-400 font-mono">90°C</span>
        </span>
        <span className="flex items-center gap-1 text-gray-400" title="Brake Temperature">
          <Disc className="w-2.5 h-2.5 text-gray-500" />
          <span ref={brakeRefs[index]} className="text-gray-300 font-mono">350°C</span>
        </span>
      </div>
    </div>
  );

  return (
    <div className="hud-glass rounded-xl p-3 flex flex-col gap-2 w-64 border border-white/10 shadow-xl">
      <div className="flex items-center justify-between border-b border-white/10 pb-1">
        <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">
          TYRES & BRAKES (°C)
        </span>
        <span className="text-[9px] font-mono text-cyan-400">4-CORNER</span>
      </div>

      {/* Grid: Front Left & Front Right on top, Rear Left & Rear Right below */}
      <div className="grid grid-cols-2 gap-2">
        {renderCorner(2, 'FL')}
        {renderCorner(3, 'FR')}
        {renderCorner(0, 'RL')}
        {renderCorner(1, 'RR')}
      </div>
    </div>
  );
});
