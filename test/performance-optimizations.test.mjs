import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleNational, enhancedSources, nationalOverview} from '../src/worker/national.js';

const app=fs.readFileSync('src/client/app.js','utf8');
const worker=fs.readFileSync('src/worker/national.js','utf8');
const sw=fs.readFileSync('public/service-worker.js','utf8');
const map=fs.existsSync('src/client/map-view.js')?fs.readFileSync('src/client/map-view.js','utf8'):'';
const zones=fs.existsSync('src/client/zones-view.js')?fs.readFileSync('src/client/zones-view.js','utf8'):'';
const index=fs.readFileSync('src/worker/index.js','utf8');

test('INITIAL_LOAD_LAZY_LOADS_MAP_AND_ZONES_AND_DOES_NOT_FETCH_SOURCE_CATALOG',()=>{
  assert.doesNotMatch(app,/loadSourcesData/);
  assert.match(app,/import\([^)]*map-view\.js\?v=/);
  assert.match(app,/import\([^)]*zones-view\.js\?v=/);
  assert.doesNotMatch(app,/function renderMap\(/);
  assert.doesNotMatch(app,/async function renderZones\(/);
  assert.doesNotMatch(app,/(?<!\.)renderMapMarkers\(\)/);
  assert.doesNotMatch(app,/(?<!\.)renderMap\(\)/);
  assert.doesNotMatch(app,/renderZones\(\)/);
  assert.doesNotMatch(app,/\$\('#argenmap'\)\.removeAttribute\('src'\)/);
  assert.equal(fs.readFileSync('src/client/map-view.js','utf8'),fs.readFileSync('public/map-view.js','utf8'));
  assert.equal(fs.readFileSync('src/client/zones-view.js','utf8'),fs.readFileSync('public/zones-view.js','utf8'));
  assert.match(app,/host\.dataset\.renderSignature===markup/);
  assert.match(app,/\$\$\('\[data-map-role\]'\)\.forEach/);
});

test('SERVICE_WORKER_PRECACHE_VERSIONED_LAZY_MODULES_FOR_OFFLINE_USE',()=>{
  assert.match(sw,/\/map-view\.js\?v='?\+RELEASE/);
  assert.match(sw,/\/zones-view\.js\?v='?\+RELEASE/);
  assert.match(sw,/icons\/icon-master\.svg/);
  assert.match(sw,/pathname===['\"]\/map-view\.js['\"]/);
  assert.match(sw,/pathname===['\"]\/zones-view\.js['\"]/);
  assert.match(map,/const cssWidth=Math\.min\(900/);
  assert.match(fs.readFileSync('public/index.html','utf8'),/id="argenmap" decoding="async"/);
  assert.match(fs.readFileSync('public/index.html','utf8'),/rel="icon" type="image\/svg\+xml" href="\/icons\/icon-master\.svg"/);
});

test('SAVED_ZONES_USE_ONE_BATCH_REQUEST_NOT_ONE_REQUEST_PER_ZONE',()=>{
  assert.match(zones,/\/api\/events\/batch/);
  assert.doesNotMatch(zones,/\/api\/events\?bbox=/);
});

class BatchDb {
  constructor(rows=[]){this.rows=rows;this.batchCalls=0;this.firstCalls=0;this.allCalls=0;this.queries=[]}
  prepare(sql){const db=this;const q={sql,values:[],bind(...values){this.values=values;return this},async first(){db.firstCalls++;db.queries.push(sql);if(sql.includes('scheduler:last_cycle'))return{updated_at:'2026-10-21T16:00:00.000Z'};if(sql.includes("provider_id='smn-cap'"))return{state:'FRESH_PARSED',verified_at:'2026-10-21T16:00:00.000Z',active_count:1,can_say_no_active:1,error_class:null};return null},async all(){db.allCalls++;db.queries.push(sql);if(sql.includes('FROM hazard_events'))return{results:db.rows};if(sql.includes('FROM provider_verification'))return{results:[]};return{results:[]}}};return q}
  async batch(statements){this.batchCalls++;return statements.map(q=>{this.queries.push(q.sql);if(q.sql.includes('FROM hazard_events'))return{results:this.rows};if(q.sql.includes("provider_id='smn-cap'"))return{results:[{state:'FRESH_PARSED',verified_at:'2026-10-21T16:00:00.000Z',active_count:1,can_say_no_active:1,error_class:null}]};if(q.sql.includes('FROM provider_verification'))return{results:[]};return{results:[]}})}
}
const makeEvent=(id,bbox)=>({eventId:id,hazardType:'FLOOD',lifecycle:'ACTIVE',bbox,provinces:['Santa Fe'],regions:['Santa Fe'],sources:[],records:[],firstSeenAt:'2026-10-21T15:00:00.000Z',lastChangedAt:'2026-10-21T15:30:00.000Z',expiresAt:'2026-10-22T15:00:00.000Z',officialWarningState:'NONE_VERIFIED',observationState:'PRESENT',verificationState:'VERIFIED_MACHINE',freshness:'FRESH'});

test('DURABLE_NATIONAL_OVERVIEW_BATCHES_BOUNDED_READS',async()=>{
  const db=new BatchDb([{payload_json:JSON.stringify(makeEvent('qa:event-a',[-61,-32,-60,-31]))}]);
  const out=await nationalOverview(db,{fetch:async()=>new Response('{}')},{});
  assert.equal(out.dataPlane,'DURABLE_D1');
  assert.equal(db.batchCalls,1,'event rows and verification records should share one D1 batch');
  assert.equal(db.firstCalls,1,'only the durable heartbeat should be queried before the batch');
  assert.equal(db.allCalls,0,'do not issue sequential read queries after the heartbeat');
});

test('BATCH_EVENT_ENDPOINT_GROUPS_EVENTS_BY_ZONE_WITH_ONE_D1_READ_BATCH',async()=>{
  const db=new BatchDb([{payload_json:JSON.stringify(makeEvent('qa:event-a',[-61,-32,-60,-31]))},{payload_json:JSON.stringify(makeEvent('qa:event-b',[-65,-34,-64,-33]))}]);
  const request=new Request('https://aphora.test/api/events/batch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({zones:[{id:'sf',bbox:[-62,-33,-59,-30]},{id:'west',bbox:[-66,-35,-63,-32]}]})});
  const response=await handleNational(request,{HAZARD_DB:db},{fetch:async()=>new Response('{}')});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body.data.zones.map(z=>z.id),['sf','west']);
  assert.equal(body.data.zones[0].events.length,1);
  assert.equal(body.data.zones[1].events.length,1);
  assert.equal(db.batchCalls,1,'all saved zones must share one bounded D1 read');
});

test('COMPACT_SOURCE_CATALOG_OMITS_UNUSED_LEGACY_SNAPSHOT_PAYLOAD',async()=>{
  const legacy={fetch:async()=>new Response(JSON.stringify({ok:true,data:{snapshotId:'large-legacy-payload',systems:[{id:'one'}],alerts:[{id:'two'}],sources:[]}}),{headers:{'content-type':'application/json'}})};
  const compact=await enhancedSources(legacy,{},true);
  assert.equal(compact.headers.get('cache-control'),'public, max-age=15, stale-while-revalidate=45');
  const compactJson=await compact.json();
  assert.equal(compactJson.data.legacy,undefined);
  assert.ok(Array.isArray(compactJson.data.capabilityRegistry));
  const full=await enhancedSources(legacy,{});
  assert.ok((await full.json()).data.legacy,'the existing default API contract remains compatible');
});


test('COMPACT_SOURCE_CATALOG_QUERY_IS_ROUTED_TO_LIGHTWEIGHT_HANDLER',()=>{assert.match(index,/enhancedSources\(legacy,env,u\.searchParams\.get\('view'\)==='capabilities'\)/)});
