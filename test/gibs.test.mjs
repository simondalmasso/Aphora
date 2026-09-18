import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const domain=fs.readFileSync('src/domain/hazard.js','utf8');
const national=fs.readFileSync('src/worker/national.js','utf8');
const push=fs.readFileSync('src/worker/push.js','utf8');
const selectedIds=[
  'MODIS_Terra_CorrectedReflectance_TrueColor',
  'MODIS_Combined_Flood_1-Day',
  'MODIS_Combined_Flood_3-Day',
  'IMERG_Precipitation_Rate_30min_v7_NRT',
  'VIIRS_SNPP_Thermal_Anomalies_375m_All_v2_NRT'
];

test('GIBS_ZERO_INITIAL_REQUESTS',()=>{
  assert.doesNotMatch(html,/gibs\.earthdata\.nasa\.gov/i);
  assert.match(html,/id="gibs-layer-select"[^>]*><option value="">Apagado<\/option>/);
  assert.match(html,/id="gibs-overlay"[^>]*hidden/);
  assert.doesNotMatch(html,/id="gibs-overlay"[^>]+src=/);
  assert.match(app,/let selectedGibsKey=''/);
  assert.match(app,/show\('now'\);loadOverview\(\);load\(\);\s*$/);
  assert.doesNotMatch(app,/show\('now'\);.*loadGibsLayer/s);
});

test('GIBS_ONLY_AFTER_LAYER_SELECTION',()=>{
  assert.match(app,/function loadGibsLayer\(key\).*currentView!=='map'.*\$\('#map-view'\)\.hidden.*return/s);
  assert.match(app,/\$\('#gibs-layer-select'\)\.onchange=.*selectedGibsKey=e\.target\.value.*currentView==='map'.*loadGibsLayer\(selectedGibsKey\)/s);
  assert.match(app,/function renderMap\(\).*if\(selectedGibsKey\)/s);
  assert.equal((app.match(/fetch\(gibsDomainUrl\(layer\)/g)||[]).length,1);
});

test('GIBS_TIMESTAMP_VISIBLE',()=>{
  assert.match(html,/id="gibs-time"/);
  assert.match(app,/Tiempo de observación\/producto: \$\{time\}/);
  assert.match(app,/DimensionDomain Domain/);
});

test('GIBS_NO_DATA_FAILS_CLOSED',()=>{
  assert.match(app,/function setGibsUnavailable/);
  assert.match(app,/overlay\.hidden=true;overlay\.removeAttribute\('src'\)/);
  assert.match(app,/No se interpreta como ausencia de inundación ni de riesgo/);
  assert.match(app,/overlay\.onerror=\(\)=>setGibsUnavailable\(\)/);
});

test('GIBS_STALE_NOT_CURRENT',()=>{
  assert.match(app,/state:'STALE',text:'Desactualizado: no representa el estado actual\.'/);
  assert.match(html,/Una imagen desactualizada no representa el estado actual/);
});

test('GIBS_NEVER_OFFICIAL_WARNING',()=>{
  assert.match(html,/No es una alerta oficial ni confirma una emergencia/);
  for(const id of selectedIds){assert.doesNotMatch(domain,new RegExp(id));assert.doesNotMatch(national,new RegExp(id));assert.doesNotMatch(push,new RegExp(id));}
  assert.doesNotMatch(app,/IMERG_Precipitation_Rate_v7_STD/);
});

test('GIBS_NEVER_CURRENT_IMPACT_ALONE',()=>{
  assert.match(html,/No determina afectación actual por sí sola/);
  assert.match(html,/No detectar agua no significa ausencia de riesgo/);
  assert.match(html,/Nubes o falta de datos no significan ausencia de inundación/);
  for(const id of selectedIds) assert.doesNotMatch(domain,new RegExp(id));
});

test('GIBS selected layer identifiers match verified capabilities',()=>{
  for(const id of selectedIds) assert.match(app,new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(app,/GoogleMapsCompatible_Level9/);
  assert.match(app,/GoogleMapsCompatible_Level6/);
  assert.match(app,/format:'image\/jpeg'/);
  assert.match(app,/format:'image\/png'/);
});

test('GIBS CSP permits only the verified NASA host for visual/domain requests',()=>{
  const worker=fs.readFileSync('src/worker/index.js','utf8');
  assert.match(worker,/img-src[^;]*https:\/\/gibs\.earthdata\.nasa\.gov/);
  assert.match(worker,/connect-src[^;]*https:\/\/gibs\.earthdata\.nasa\.gov/);
  assert.doesNotMatch(worker,/worldview\.earthdata\.nasa\.gov/);
});
