import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/app.css','utf8');

test('DEFAULT_REFERENCE_NOT_FALSE_PERSONAL',()=>{
  assert.match(html,/id="reference-kind">ÁREA DE EXPLORACIÓN</);
  assert.doesNotMatch(html,/TU ZONA · AHORA/);
  assert.match(app,/function referenceLabel\(/);
  assert.match(app,/explore:'ÁREA DE EXPLORACIÓN'/);
  assert.match(app,/manual:'LOCALIDAD SELECCIONADA'/);
  assert.match(app,/zone:'TU ZONA'/);
  assert.match(app,/gps:'TU UBICACIÓN'/);
});

test('MANUAL_REFERENCE_PERSISTS',()=>{
  assert.match(app,/aphora-last-manual-reference/);
  assert.match(app,/persistManualReference\(selected\)/);
  assert.match(app,/restoreReference\(/);
});

test('GPS_EXPLICIT_ONLY_AND_NOT_PERSISTED',()=>{
  const call=app.indexOf('getCurrentPosition');
  const click=app.lastIndexOf("$('#use-location').onclick",call);
  assert.ok(call>0&&click>=0&&click<call);
  assert.doesNotMatch(app,/localStorage\.setItem\([^\n]*(?:gps|location-history|position-history)/i);
  assert.doesNotMatch(app,/watchPosition/);
});

test('ACTIVE_SAVED_ZONE_REFERENCE_HAS_PRIORITY_PATH',()=>{
  assert.match(app,/aphora-active-zone-reference/);
  assert.match(app,/persistActiveZoneReference\(/);
  assert.match(app,/mode:'zone'/);
});

test('HYDROLOGY_IS_FIRST_CLASS_IN_NOW',()=>{
  assert.match(html,/id="nearby-observations"/);
  assert.match(html,/RÍOS CERCA|CERCA TUYO/);
  assert.doesNotMatch(html,/id="specialist"/);
  assert.match(app,/\/api\/observations\?type=RIVER_LEVEL/);
  assert.match(app,/renderNearbyEvidence\(/);
});

test('RIVER_COORDINATES_NOT_OWNED_BY_FRONTEND',()=>{
  assert.doesNotMatch(app,/RIVER_STATIONS|parana-santa-fe\s*:\s*\{|salado-santo-tome\s*:\s*\{/i);
  assert.doesNotMatch(app,/-60\.684[^\n]{0,120}Río Paraná|-60\.773[^\n]{0,120}Río Salado/);
  assert.match(app,/coordinateSource/);
});

test('RIVER_CARD_TRUTH_FIELDS_VISIBLE',()=>{
  assert.match(app,/MEDICIÓN HIDROMÉTRICA/);
  assert.match(app,/NO ES UNA ALERTA DE INUNDACIÓN/);
  assert.match(app,/delta24h/);
  assert.match(app,/distanceKm/);
  assert.match(app,/observedAt/);
  assert.match(app,/freshness/);
  assert.match(app,/INA/);
});

test('RIVER_UNKNOWN_NEVER_RENDERED_AS_ZERO',()=>{
  assert.match(app,/o\.value==null\?'—'/);
  assert.doesNotMatch(app,/o\.value\s*\|\|\s*0/);
});

test('RIVER_MARKS_ARE_DISTINCT_EVIDENCE_ON_SITUATION_CANVAS',()=>{
  assert.match(app,/data\.situationObservationId/);
  assert.match(app,/situation-river-observation/);
  assert.match(css,/\.situation-river-observation/);
});

test('UNIFIED_NEARBY_WARNING_AND_OBSERVATION_COMPOSITION',()=>{
  assert.match(app,/function rankNearbyClient\(/);
  assert.match(app,/function evidenceKindForRole\(/);
  assert.match(app,/OFFICIAL_WARNING.*WARNING/);
  assert.match(app,/return'OBSERVATION'/);
  assert.match(app,/WHAT|QUÉ/);
});

test('SOURCE_SCOPED_DEGRADATION_INA_INDEPENDENT',()=>{
  assert.match(app,/observationSourceState/);
  assert.match(app,/providerVerification\.ina/);
  assert.match(app,/ALERTAS SMN/);
  assert.match(html,/id="source-pulse"/);
});

test('PRESENTATION_CLUSTER_UI_PRESERVES_REAL_IDS',()=>{
  assert.match(app,/function presentationClusters\(/);
  assert.match(app,/eventIds/);
  assert.match(app,/data-cluster-toggle/);
  assert.match(app,/data-detail=/);
});

test('MAP_LIST_CANONICAL_PARITY_REMAINS_REAL_EVENTS',()=>{
  assert.match(app,/function renderMapMarkers\(\).*for\(const e of events\)/s);
  assert.doesNotMatch(app,/function renderMapMarkers\(\).*presentationClusters/s);
});

test('NO_FAKE_RIVER_SEVERITY_OR_THRESHOLD',()=>{
  const m=app.match(/function riverCard\([\s\S]*?\nfunction /)?.[0]||'';
  assert.ok(m.length>0);
  assert.doesNotMatch(m,/severity|threshold|alertLevel|evacuation/i);
});

test('SOURCE_FAILURE_DOES_NOT_POISON_OTHER_SOURCE',()=>{
  assert.match(app,/renderSourceScopedStatus\(/);
  assert.match(app,/SMN/);
  assert.match(app,/INA/);
  assert.match(app,/INPRES/);
});

test('FRONTEND_BYTE_OWNER_IDENTITY_SUPER_R1',()=>{
  assert.ok(fs.readFileSync('src/client/app.js').equals(fs.readFileSync('public/app.js')));
});

test('CLIENT_PRESENTATION_CLUSTERING_ONLY_CLUSTERS_OFFICIAL_WARNINGS',()=>{assert.match(app,/sourceRole!==['"]OFFICIAL_WARNING['"]/);});

test('SITUATION_RIVER_MARKER_KEYBOARD_ACCESSIBLE',()=>{assert.match(app,/situationObservationId[\s\S]{0,900}tabindex[\s\S]{0,900}onkeydown/);});

test('CLIENT_EVIDENCE_KIND_PRESERVES_WARNING_OBSERVATION_SUPPLEMENTARY_ROLES',()=>{assert.match(app,/function evidenceKindForRole\(/);assert.match(app,/OFFICIAL_WARNING.*WARNING/);assert.match(app,/startsWith\('SUPPLEMENTARY_'\).*SUPPLEMENTARY/);});
