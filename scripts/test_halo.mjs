import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTelemetry, connectionState} from '../backend/static/halo-model.js';

test('real UDP frame and legacy percentage payload normalize consistently', () => {
  const a = normalizeTelemetry({type:'telemetry', data:{speed:284, gear:7, throttle:0.8, brake:0, engineRPM:12000, maxRPM:13500, ersStoreEnergy:3120000, drs:1, tyresSurfaceTemperature:[91,92,93,94]}});
  const b = normalizeTelemetry({speed:284, gear:7, throttle:80, brake:0, engine_rpm:12000, max_rpm:13500, ers_store:78, drs:1, tyre_surface_temp:[91,92,93,94]});
  assert.deepEqual(a,b);
  assert.equal(a.throttle,80); assert.equal(a.ers,78);
  assert.deepEqual(a.tyres,{fl:93,fr:94,rl:91,rr:92});
});
test('zero battery, reverse, neutral and full pedal values remain valid', () => {
  assert.equal(normalizeTelemetry({ersStoreEnergy:0}).ers,0);
  assert.equal(normalizeTelemetry({gear:-1}).gear,'R');
  assert.equal(normalizeTelemetry({gear:0}).gear,'N');
  assert.equal(normalizeTelemetry({gear:8, throttle:1}).throttle,100);
  assert.equal(normalizeTelemetry({brake:100}).brake,100);
});
test('malformed values never poison render geometry; DRS has three states', () => {
  const f=normalizeTelemetry({speed:'bad',engineRPM:Infinity,throttle:-10,brake:200,ers_store:300,gear:20});
  assert.equal(f.speed,0); assert.equal(f.rpm,0); assert.equal(f.throttle,0);
  assert.equal(f.brake,100); assert.equal(f.ers,100); assert.equal(f.gear,'N');
  assert.equal(normalizeTelemetry({drsAllowed:1}).drs,'READY');
  assert.equal(normalizeTelemetry({drs:1}).drs,'ON');
  assert.equal(normalizeTelemetry({drs:0}).drs,'OFF');
});
test('connected WebSocket is not mistaken for live game telemetry', () => {
  assert.equal(connectionState(true,null,10000),'WAITING');
  assert.equal(connectionState(true,9000,10000),'LIVE');
  assert.equal(connectionState(true,7000,10000),'STALE');
  assert.equal(connectionState(false,9000,10000),'OFFLINE');
});
