const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, number(value)));
const pedal = value => {const n=number(value); return clamp(n > 0 && n <= 1 ? n*100 : n,0,100);};
export function normalizeTelemetry(raw) {
  const d = raw?.type === 'telemetry' ? (raw.data || raw) : (raw || {});
  const g = number(d.gear);
  const tyres = d.tyresSurfaceTemperature ?? d.tyre_surface_temp ?? [];
  const maxRpm = Math.max(4001,number(d.maxRPM ?? d.max_rpm,13500));
  return {
    speed: Math.round(clamp(d.speed,0,500)),
    gear: g === -1 ? 'R' : g >= 1 && g <= 8 && Number.isInteger(g) ? String(g) : 'N',
    rpm: clamp(d.engineRPM ?? d.engine_rpm,0,maxRpm), maxRpm,
    throttle:pedal(d.throttle), brake:pedal(d.brake),
    ers:clamp(d.ersStoreEnergy != null ? number(d.ersStoreEnergy)/40000 : (d.ers_store ?? 0),0,100),
    drs:number(d.drs) === 1 ? 'ON' : number(d.drsAllowed ?? d.drs_allowed) === 1 ? 'READY' : 'OFF',
    tyres:{fl:number(tyres[2]),fr:number(tyres[3]),rl:number(tyres[0]),rr:number(tyres[1])}
  };
}
export function connectionState(connected,lastFrame,now) {
  return !connected ? 'OFFLINE' : lastFrame == null ? 'WAITING' : now-lastFrame > 2000 ? 'STALE' : 'LIVE';
}
