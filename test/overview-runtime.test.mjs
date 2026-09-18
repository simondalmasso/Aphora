import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker/index.js';

const EVENT={
  eventId:'evt-smn-storm-sf',
  hazardType:'STORM',
  lifecycle:'ACTIVE',
  geometry:{type:'Point',coordinates:[-60.7,-31.63]},
  bbox:[-60.72,-31.65,-60.68,-31.61],
  provinces:['Santa Fe'],
  regions:['Santa Fe Capital'],
  officialWarningState:'ACTIVE',
  observationState:'NONE',
  displaySeverity:'SEVERE',
  lastChangedAt:'2026-08-31T22:10:00.000Z',
  records:[{
    recordId:'smn:cap-1',providerId:'smn-cap',sourceRole:'OFFICIAL_WARNING',
    sourceOrganization:'Servicio Meteorológico Nacional',verificationState:'VERIFIED_MACHINE',
    freshness:'FRESH',capSeverity:'Severe',issuedAt:'2026-08-31T22:05:00.000Z',
    observedAt:null,fetchedAt:'2026-08-31T22:06:00.000Z'
  }]
};

class MockD1Statement{
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[]}
  bind(...args){this.args=args;return this}
  async first(){
    if(this.sql.includes("FROM runtime_state WHERE key='scheduler:last_cycle'"))return{updated_at:'2026-08-31T22:11:00.000Z'};
    if(this.sql.includes("FROM provider_verification WHERE provider_id='smn-cap'"))return{state:'FRESH_PARSED',verified_at:'2026-08-31T22:06:00.000Z',active_count:1,can_say_no_active:1,error_class:null};
    return null;
  }
  async all(){
    if(this.sql.includes("FROM hazard_events WHERE lifecycle='ACTIVE'"))return{results:[{payload_json:JSON.stringify(EVENT)}]};
    if(this.sql.includes('FROM provider_verification ORDER BY provider_id'))return{results:[{provider_id:'smn-cap',state:'FRESH_PARSED',verified_at:'2026-08-31T22:06:00.000Z',error_class:null,payload_json:JSON.stringify({state:'FRESH_PARSED',activeCount:1,canSayNoActiveOfficialWarnings:true,fetchedAt:'2026-08-31T22:06:00.000Z'})}]};
    return{results:[]};
  }
}
class MockD1{prepare(sql){return new MockD1Statement(this,sql)}}

async function runtimeOverview(){
  const response=await worker.fetch(new Request('https://aphora.test/api/overview'),{HAZARD_DB:new MockD1()});
  assert.equal(response.status,200);
  return response.json();
}

test('OVERVIEW_RUNTIME_OWNER_SINGLE',()=>{
  const index=fs.readFileSync('src/worker/index.js','utf8');
  const national=fs.readFileSync('src/worker/national.js','utf8');
  const order031=fs.readFileSync('src/worker/order031.js','utf8');
  assert.match(index,/handleNational\(request,env,legacy\)/);
  assert.match(national,/export async function nationalOverview\(/);
  assert.match(national,/\/api\/overview.*nationalOverview\(db,legacy,env\)/);
  assert.match(order031,/\/api\/overview.*nationalOverview\(env\.HAZARD_DB\|\|null,legacy,env\)/);
  assert.doesNotMatch(order031,/overviewDb|situationEvents:/);
});

test('DEFAULT_WORKER_OVERVIEW_HAS_SITUATION_EVENTS',async()=>{
  const payload=await runtimeOverview(),d=payload.data;
  assert.equal(d.dataPlane,'DURABLE_D1');
  assert.equal(d.situationEvents.length,1);
  assert.deepEqual(d.situationEvents[0].geometry,EVENT.geometry);
  assert.deepEqual(d.situationEvents[0].bbox,EVENT.bbox);
  assert.equal(d.situationEvents[0].geometrySemantics,'Point');
  assert.equal(d.situationEvents[0].eventId,EVENT.eventId);
  assert.equal(d.situationEvents[0].sourceRole,'OFFICIAL_WARNING');
  assert.equal(d.situationEvents[0].sourceOrganization,'Servicio Meteorológico Nacional');
  assert.equal(d.situationEvents[0].verificationState,'VERIFIED_MACHINE');
  assert.equal(d.situationEvents[0].freshness,'FRESH');
  assert.equal(d.situationEvents[0].capSeverity,'Severe');
});

test('NATIONAL_EVENT_COUNT_RUNTIME',async()=>{
  const d=(await runtimeOverview()).data;
  assert.equal(d.nationalEventCount,1);
  assert.equal(d.countsByHazard.STORM,1);
  assert.equal(d.nationalActiveOfficialWarnings,1);
});

test('ACTIVE_ZONE_COUNT_RUNTIME',async()=>{
  const d=(await runtimeOverview()).data;
  assert.equal(d.activeZoneCount,1);
  assert.equal(d.countsByProvince['Santa Fe'],1);
});

test('SITUATION_CANVAS_E2E_REAL_API_MARKERS',async()=>{
  const d=(await runtimeOverview()).data;
  const app=fs.readFileSync('src/client/app.js','utf8');
  const line=name=>{const m=app.match(new RegExp(`^function ${name}\\([^\\n]+$`,'m'));assert.ok(m,`missing actual client function ${name}`);return m[0]};
  const iconMap=app.match(/^const hazardIconMap=.*$/m);assert.ok(iconMap);
  const host={innerHTML:'',children:[],append(n){this.children.push(n)}};
  const mk=()=>({dataset:{},classList:{values:[],add(...x){this.values.push(...x)}},setAttribute(k,v){this[k]=v},innerHTML:'',onclick:null});
  const context={
    input:d,rawEvents:[EVENT],
    document:{querySelector:s=>s==='#situation-events'?host:null,createElementNS:()=>mk()},
    $:s=>s==='#situation-events'?host:null,
    renderSituationSelection(){},renderSituationSelected(){},openEventDetail(){},
    console
  };
  vm.createContext(context);
  const src=[iconMap[0],line('hazardIconId'),line('validBbox'),line('projectArgentina'),line('situationPoint'),line('renderSituationCanvas'),'renderSituationCanvas(input.situationEvents);'].join('\n');
  vm.runInContext(src,context);
  assert.equal(host.children.length,1);
  assert.equal(host.children[0].dataset.situationEventId,EVENT.eventId);
  assert.ok(host.children[0].classList.values.includes('situation-marker'));
});
