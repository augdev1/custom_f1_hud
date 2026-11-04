import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Zap, Wind } from 'lucide-react';

export interface ErsDrsHandle {
  update: (drs: number, drsAllowed: number, ersEnergy: number, ersMode: number) => void;
}

const DEPLOY_MODES = ['OFF', 'MEDIUM', 'HOTLAP', 'OVERTAKE'];
const MAX_ERS_JOULES = 4_000_000.0;

export const ErsDrsDisplay = forwardRef<ErsDrsHandle>((_, ref) => {
  const drsBadgeRef = useRef<HTMLDivElement>(null);
  const drsTextRef = useRef<HTMLSpanElement>(null);
  const ersBarRef = useRef<HTMLDivElement>(null);
  const ersPctTextRef = useRef<HTMLSpanElement>(null);
  const ersModeTextRef = useRef<HTMLSpanElement>(null);

  useImperativeHandle(ref, () => ({
    update: (drs: number, drsAllowed: number, ersEnergy: number, ersMode: number) => {
      // 1. DRS Updates
      if (drsBadgeRef.current && drsTextRef.current) {
        if (drs === 1) {
          drsBadgeRef.current.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-black bg-cyan-500 text-black shadow-glow-cyan transition-none";
          drsTextRef.current.textContent = "DRS ACTIVE";
        } else if (drsAllowed === 1) {
          drsBadgeRef.current.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-black bg-green-500/20 text-green-300 border border-green-400 shadow-glow-green transition-none";
          drsTextRef.current.textContent = "DRS READY";
        } else {
          drsBadgeRef.current.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-bold bg-white/5 text-gray-500 border border-white/5 transition-none";
          drsTextRef.current.textContent = "DRS CLOSED";
        }
      }

      // 2. ERS Updates
      const ersPct = Math.min(100, Math.max(0, (ersEnergy / MAX_ERS_JOULES) * 100));
      if (ersBarRef.current) {
        ersBarRef.current.style.width = `${ersPct.toFixed(1)}%`;
      }
      if (ersPctTextRef.current) {
        ersPctTextRef.current.textContent = `${ersPct.toFixed(0)}%`;
      }
      if (ersModeTextRef.current) {
        const modeLabel = DEPLOY_MODES[ersMode] || 'MED';
        ersModeTextRef.current.textContent = modeLabel;
        
        if (ersMode === 3) {
          ersModeTextRef.current.className = "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-purple-600 text-white shadow-glow-purple";
        } else if (ersMode === 2) {
          ersModeTextRef.current.className = "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500 text-black";
        } else {
          ersModeTextRef.current.className = "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/10 text-gray-300";
        }
      }
    }
  }));

  return (
    <div className="hud-glass rounded-xl p-3 flex flex-col gap-2.5 w-64 border border-white/10 shadow-xl">
      {/* Top Header: DRS badge + ERS Mode */}
      <div className="flex items-center justify-between">
        <div
          ref={drsBadgeRef}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-bold bg-white/5 text-gray-500 border border-white/5"
        >
          <Wind className="w-3.5 h-3.5" />
          <span ref={drsTextRef}>DRS CLOSED</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-gray-400 font-bold uppercase">MODE:</span>
          <span ref={ersModeTextRef} className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/10 text-gray-300">
            MED
          </span>
        </div>
      </div>

      {/* ERS Battery Bar */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center text-[10px] font-mono font-bold text-gray-400">
          <span className="flex items-center gap-1 text-cyan-400">
            <Zap className="w-3 h-3 fill-cyan-400" /> ERS STORE
          </span>
          <span ref={ersPctTextRef} className="text-white font-mono">100%</span>
        </div>

        <div className="w-full h-3 bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/10">
          <div
            ref={ersBarRef}
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 shadow-glow-cyan transition-none"
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </div>
  );
});
