import React, { useEffect, useRef, useState } from 'react';
import { RpmBar, RpmBarHandle } from './RpmBar';
import { GearSpeedDisplay, GearSpeedHandle } from './GearSpeedDisplay';
import { ErsDrsDisplay, ErsDrsHandle } from './ErsDrsDisplay';
import { TyreBrakeDisplay, TyreBrakeHandle } from './TyreBrakeDisplay';
import { TelemetryFrame, ConnectionStatus } from '../types/telemetry';
import { Activity, Radio } from 'lucide-react';

interface HudOverlayProps {
  wsUrl?: string;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({ wsUrl = 'ws://127.0.0.1:8000/ws/telemetry' }) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  // Sub-component Imperative Handles
  const rpmBarRef = useRef<RpmBarHandle>(null);
  const gearSpeedRef = useRef<GearSpeedHandle>(null);
  const ersDrsRef = useRef<ErsDrsHandle>(null);
  const tyreBrakeRef = useRef<TyreBrakeHandle>(null);

  // Latest incoming frame stored in mutable ref (zero React state updates at 60Hz)
  const latestFrameRef = useRef<TelemetryFrame | null>(null);
  const lastProcessedTimeRef = useRef<number>(-1);

  // 1. Establish WebSocket link with exponential reconnect
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let isDisposed = false;

    const connect = () => {
      if (isDisposed) return;
      setConnectionStatus('connecting');

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (isDisposed) return;
          setConnectionStatus('connected');
        };

        ws.onmessage = (event) => {
          try {
            const frame: TelemetryFrame = JSON.parse(event.data);
            latestFrameRef.current = frame;
          } catch {
            // Ignore parse errors on ping/pong
          }
        };

        ws.onclose = () => {
          if (isDisposed) return;
          setConnectionStatus('disconnected');
          reconnectTimeout = setTimeout(connect, 1500);
        };

        ws.onerror = () => {
          if (ws) ws.close();
        };
      } catch {
        setConnectionStatus('disconnected');
        reconnectTimeout = setTimeout(connect, 2000);
      }
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [wsUrl]);

  // 2. High-performance requestAnimationFrame loop (direct DOM mutation, zero VDOM churn)
  useEffect(() => {
    let animationFrameId: number;

    const renderTick = () => {
      const frame = latestFrameRef.current;
      if (frame && frame.sendTimestampMs !== lastProcessedTimeRef.current) {
        lastProcessedTimeRef.current = frame.sendTimestampMs;

        // Direct DOM mutations
        rpmBarRef.current?.update(frame.engineRPM, frame.maxRPM || 13500);
        gearSpeedRef.current?.update(frame.speed, frame.gear, frame.throttle, frame.brake);
        ersDrsRef.current?.update(frame.drs, frame.drsAllowed, frame.ersStoreEnergy, frame.ersDeployMode);
        tyreBrakeRef.current?.update(frame.tyresSurfaceTemperature, frame.brakesTemperature);
      }

      animationFrameId = requestAnimationFrame(renderTick);
    };

    animationFrameId = requestAnimationFrame(renderTick);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div className="relative w-screen h-screen flex flex-col justify-end pb-8 items-center bg-transparent pointer-events-none select-none">
      {/* Top Telemetry Status Pill */}
      <div className="absolute top-4 right-6 flex items-center gap-2 px-3 py-1.5 rounded-full hud-glass text-[11px] font-mono">
        <Radio
          className={`w-3.5 h-3.5 ${
            connectionStatus === 'connected'
              ? 'text-green-400 animate-pulse'
              : connectionStatus === 'connecting'
              ? 'text-yellow-400'
              : 'text-red-500'
          }`}
        />
        <span className="text-gray-300 font-bold uppercase tracking-wider">
          {connectionStatus === 'connected' ? 'F1 24 TELEMETRY 60HZ' : connectionStatus}
        </span>
      </div>

      {/* Main HUD Cluster */}
      <div className="flex flex-col items-center gap-3 w-full max-w-4xl px-4">
        {/* Top: 15-LED RPM Shift Indicator */}
        <RpmBar ref={rpmBarRef} />

        {/* Middle: Gauges and Center Instrument */}
        <div className="w-full flex items-center justify-between gap-4">
          {/* Left Wing: ERS & DRS */}
          <div className="flex-1 flex justify-end">
            <ErsDrsDisplay ref={ersDrsRef} />
          </div>

          {/* Center: Gear, Speedometer & Pedals */}
          <div className="flex-shrink-0">
            <GearSpeedDisplay ref={gearSpeedRef} />
          </div>

          {/* Right Wing: 4-Corner Tyres & Brakes */}
          <div className="flex-1 flex justify-start">
            <TyreBrakeDisplay ref={tyreBrakeRef} />
          </div>
        </div>
      </div>
    </div>
  );
};
