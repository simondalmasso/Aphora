import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleNational,enhancedHealth} from '../src/worker/national.js';

const fixtureNow=Date.now(),fixtureSent=new Date(fixtureNow-60*60*1000).toISOString(),fixtureExpires=new Date(fixtureNow+48*60*60*1000).toISOString();
const CAP=`<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>quota-fixture-1</identifier><sender>smn@smn.gob.ar</sender><sent>${fixtureSent}</sent><status>Actual</status><msgType>Alert</msgType><scope>Public</scope><info><language>es-AR</language><category>Met</category><event>Tormentas</event><urgency>Immediate</urgency><severity>Severe</severity><certainty>Likely</certainty><expires>${fixtureExpires}</expires><headline>Tormentas fuertes</headline><description>Evento de prueba de fallback D1.</description><instruction>SeguÃ­ indicaciones oficiales</instruction><area><areaDesc>Santa Fe</areaDesc><polygon>-31.80,-60.90 -31.45,-60.90 -31.45,-60.45 -31.80,-60.45 -31.80,-60.90</polygon></area></info></alert>`;

class QuotaStatement{
  bind(){return this}
  async first(){const e=new Error('D1_ERROR: exceeded daily rows read limit [code: 7500]');e.code=7500;throw e}
  async all(){const e=new Error('D1_ERROR: exceeded daily rows read limit [code: 7500]');e.code=7500;throw e}
  async run(){const e=new Error('D1_ERROR: exceeded daily rows read limit [code: 7500]');e.code=7500;throw e}
}
class QuotaD1{prepare(){return new QuotaStatement()}}

const snapshot={id:'legacy-fixture',generatedAt:'2026-09-03T23:00:00.000Z',systems:[],sources:[],sourceOrganizations:[],alerts:[],timeline:[],contradictions:[],messages:[],mode:'LIVE',dataStatus:'DEGRADED',freshness:'STALE',alertStatus:'UNKNOWN'};
const legacy={async fetch(request){const p=new URL(request.url).pathname;if(p==='/api/snapshot')return new Response(JSON.stringify({ok:true,data:snapshot}),{status:200,headers:{'content-type':'application/json'}});if(p==='/api/health')return new Response(JSON.stringify({ok:true,data:{service:'legacy',status:'healthy',snapshot:{id:'legacy-fixture'}}}),{status:200,headers:{'content-type':'application/json'}});return new Response(JSON.stringify({ok:false}),{status:404,headers:{'content-type':'application/json'}})}};
const env={HAZARD_DB:new QuotaD1(),SOS_TEST_CAP_XML:CAP};

async function overview(){const r=await handleNational(new Request('https://aphora.test/api/overview'),env,legacy);assert.equal(r.status,200);return r.json()}
async function events(){const r=await handleNational(new Request('https://aphora.test/api/events?bbox=-61,-32,-60,-31&limit=50'),env,legacy);assert.equal(r.status,200);return r.json()}

test('D1_QUOTA_OVERVIEW_FALLBACK',async()=>{const p=await overview();assert.equal(p.data.dataPlane,'DEGRADED_LIVE_FALLBACK');assert.ok(Array.isArray(p.data.situationEvents));assert.equal(p.data.verification.canSayNoActiveOfficialWarnings,true)});

test('D1_QUOTA_EVENTS_FALLBACK',async()=>{const p=await events();assert.equal(p.meta.dataPlane,'DEGRADED_LIVE_FALLBACK');assert.ok(p.data.events.length>=1);assert.equal(p.data.verification.canSayNoActiveOfficialWarnings,true)});

test('D1_QUOTA_EVENT_DETAIL_FALLBACK',async()=>{const list=await events(),id=list.data.events[0].eventId;r: { const r=await handleNational(new Request('https://aphora.test/api/events/'+encodeURIComponent(id)),env,legacy);assert.equal(r.status,200);const p=await r.json();assert.equal(p.meta.dataPlane,'DEGRADED_LIVE_FALLBACK');assert.equal(p.data.eventId,id)}});

test('D1_QUOTA_HEALTH_FALLBACK',async()=>{const r=await enhancedHealth(legacy,env);assert.equal(r.status,200);const p=await r.json(),n=p.data.nationalCore;assert.equal(n.hazardDbBound,true);assert.equal(n.hazardDbConnected,false);assert.equal(n.d1QueryState,'DEGRADED_UNAVAILABLE');assert.equal(n.hazardRecordCount,null);assert.equal(n.hazardEventCount,null);assert.equal(n.pushSubscriptionCount,null);assert.equal(n.countTelemetryMode,'BOUNDED_NO_FULL_TABLE_COUNTS')});

test('HEALTH_NO_FULL_TABLE_COUNTS',()=>{const s=fs.readFileSync('src/worker/national.js','utf8');const health=s.slice(s.indexOf('export async function enhancedHealth'));assert.doesNotMatch(health,/SELECT\s+COUNT\s*\(\s*\*\s*\)/i);assert.match(health,/BOUNDED_NO_FULL_TABLE_COUNTS/)});

test('D1_QUOTA_NEVER_FALSE_ZERO_TELEMETRY',async()=>{const p=await (await enhancedHealth(legacy,env)).json(),n=p.data.nationalCore;for(const k of ['hazardRecordCount','hazardEventCount','recentEventVersionCount','pushSubscriptionCount'])assert.equal(n[k],null,k);assert.notEqual(n.hazardDbConnected,true)});
