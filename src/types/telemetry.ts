export interface TelemetryFrame {
  time: number;
  speed: number;                   // km/h
  throttle: number;                // 0.0 to 1.0
  brake: number;                   // 0.0 to 1.0
  steer: number;                   // -1.0 to 1.0
  gear: number;                    // -1=R, 0=N, 1..8
  engineRPM: number;               // Current engine RPM
  maxRPM: number;                  // Redline limit RPM
  drs: number;                     // 0=off, 1=on
  drsAllowed: number;              // 0=not allowed, 1=allowed
  ersStoreEnergy: number;          // Joules (0 to 4,000,000)
  ersDeployMode: number;           // 0=None, 1=Medium, 2=Hotlap, 3=Overtake
  brakesTemperature: [number, number, number, number];    // RL, RR, FL, FR (Celsius)
  tyresSurfaceTemperature: [number, number, number, number]; // RL, RR, FL, FR (Celsius)
  sendTimestampMs: number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
