import {normalizeTelemetry,connectionState,clamp} from './halo-model.js';
const $=id=>document.getElementById(id);
const embedded=new URLSearchParams(location.search).has('embedded');
document.body.classList.toggle('embedded',embedded);
const ns='http://www.w3.org/2000/svg';
const segments=Array.from({length:40},(_,i)=>{
  const angle=(-90+i*360/40)*Math.PI/180;
  const line=document.createElementNS(ns,'line');
  for(const [key,value] of Object.entries({x1:Math.cos(angle)*57,y1:Math.sin(angle)*57,x2:Math.cos(angle)*63,y2:Math.sin(angle)*63}))line.setAttribute(key,value);
  line.setAttribute('class','rpm'+(i>33?' redline':''));$('rpmSegments').append(line);return line;
});
const gears=['R','N','1','2','3','4','5','6','7','8'].map((gear,i)=>{
  const g=document.createElementNS(ns,'g');g.setAttribute('class','gear-cell'+(gear==='R'?' reverse':''));g.setAttribute('transform',`translate(${i*20.2} 0)`);
  const rect=document.createElementNS(ns,'rect');for(const [k,v]of Object.entries({x:0,y:0,width:19,height:25,rx:4}))rect.setAttribute(k,v);
  const t=document.createElementNS(ns,'text');t.setAttribute('x',9.5);t.setAttribute('y',18);t.textContent=gear;g.append(rect,t);$('gearStrip').append(g);return {gear,g};
});
let connected=false,lastFrame=null,pending=null,locked=false,ws,retry,disposed=false;
const labels={OFFLINE:'BACKEND DESCONECTADO',WAITING:'AGUARDANDO TELEMETRIA UDP',STALE:'SEM SINAL · TELEMETRIA INTERROMPIDA',LIVE:'TELEMETRIA AO VIVO'};
function updateStatus(){const state=connectionState(connected,lastFrame,performance.now());document.body.dataset.connection=state;for(const name of ['live','stale','offline'])document.body.classList.toggle(name,state.toLowerCase()===name);$('connection').textContent=labels[state];if(state!=='LIVE'){$('throttleBar').setAttribute('width',0);$('brakeBar').setAttribute('width',0);$('drsBadge').setAttribute('class','');$('drsText').textContent='DRS —';}}
function render(raw){const f=normalizeTelemetry(raw);$('speedVal').textContent=f.speed;$('gearInPod').textContent=f.gear;$('rpmNumText').textContent=`${Math.round(f.rpm)} RPM`;
  $('ersPctText').textContent=`${Math.round(f.ers)}%`;$('ersBar').setAttribute('width',195*f.ers/100);$('brakeBar').setAttribute('width',76*f.brake/100);$('throttleBar').setAttribute('width',76*f.throttle/100);
  const active=Math.round(clamp((f.rpm-4000)/(f.maxRpm-4000),0,1)*segments.length);segments.forEach((el,i)=>el.classList.toggle('active',i<active));gears.forEach(({gear,g})=>g.classList.toggle('active',gear===f.gear));
  $('drsBadge').setAttribute('class',f.drs==='ON'?'on':f.drs==='READY'?'ready':'');$('drsText').textContent=f.drs==='READY'?'DRS RDY':`DRS ${f.drs}`;
  $('tyreText').textContent=Object.entries(f.tyres).map(([k,v])=>`${k.toUpperCase()} ${v}°`).join('   ');
}
export function applyConfig(cfg){if(!cfg||typeof cfg!=='object')return;const style=document.documentElement.style;
  for(const [key,variable]of Object.entries({accentColor:'--accent',gearColor:'--accent',panelBg:'--panel',ersColor:'--ers',throttleColor:'--throttle',brakeColor:'--brake'})){if(/^#[0-9a-f]{6}$/i.test(cfg[key]||''))style.setProperty(variable,cfg[key]);}
  if(cfg.opacity!=null)style.setProperty('--panel-opacity',clamp(cfg.opacity,0,100)/100);
  if(cfg.scale!=null){const scale=clamp(cfg.scale,60,110)/100;$('halo').style.transform=`scale(${scale})`;$('halo').style.transformOrigin='50% 50%';}
  document.body.classList.toggle('show-tyres',cfg.showTyres===true);
}
function connect(){if(disposed)return;ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws/telemetry`);
  ws.onopen=()=>{connected=true;lastFrame=null;updateStatus();};
  ws.onmessage=event=>{try{const raw=JSON.parse(event.data);if(raw.type==='config_update'){applyConfig(raw.config||raw.data||raw);return;}const data=raw.type==='telemetry'?(raw.data||raw):raw;if(data.speed!==undefined||data.engineRPM!==undefined||data.engine_rpm!==undefined){lastFrame=performance.now();pending=raw;updateStatus();}}catch(error){console.warn('Pacote HUD inválido',error);}};
  ws.onclose=()=>{connected=false;pending=null;updateStatus();if(!disposed)retry=setTimeout(connect,1500);};ws.onerror=()=>ws.close();
}
let raf;function tick(){if(pending){render(pending);pending=null;}raf=requestAnimationFrame(tick);}tick();
const statusTimer=setInterval(updateStatus,250);
window.toggleLock=async()=>{const next=!locked;const api=window.pywebview?.api;if(api){try{if(!await api.set_clickthrough(next))return;}catch{ return; }}locked=next;document.body.classList.toggle('locked',locked);$('lockButton').textContent=locked?'Destravar · F8':'Travar · F8';};
$('lockButton').onclick=window.toggleLock;$('centerButton').onclick=()=>window.pywebview?.api.center_hud();$('closeButton').onclick=()=>window.pywebview?.api.close_hud();
// Native F8 is handled globally by the shell. Browser preview needs a local handler.
document.addEventListener('keydown',e=>{if(e.key==='F8'&&!window.pywebview){e.preventDefault();window.toggleLock();}});
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='halo-preview-config')applyConfig(e.data.config);});
window.addEventListener('beforeunload',()=>{disposed=true;clearTimeout(retry);clearInterval(statusTimer);cancelAnimationFrame(raf);ws?.close();});
fetch('/api/config').then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(applyConfig).catch(()=>{});connect();
