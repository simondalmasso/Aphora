import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {runDueJobs,recoverStuckJobs,persistHazardRecords,WORKER_LEASE_MS} from '../src/worker/ingestion.js';

function db(){
  const raw=new DatabaseSync(':memory:');
  for(const f of['migrations/0001-national.sql','migrations/0002-order031.sql','migrations/0003-worker-job-lease.sql']) raw.exec(fs.readFileSync(f,'utf8'));
  return {raw,prepare(sql){let args=[];return{bind(...x){args=x;return this},async run(){const r=raw.prepare(sql).run(...args);return{meta:{changes:Number(r.changes||0)}}},async all(){return{results:raw.prepare(sql).all(...args)}},async first(){return raw.prepare(sql).get(...args)||null}}}};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=2000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await sleep(5)}throw new Error('WAIT_TIMEOUT')}
function seed(d,prefix,count,at){const stamp=new Date(at).toISOString();for(let i=0;i<count;i++)d.raw.prepare("INSERT INTO provider_jobs(id,provider_id,status,attempts,next_attempt_at,created_at,runtime_recovery_count) VALUES(?,?,?,?,?,?,0)").run(`${prefix}-${i}`,`${prefix}-provider-${i}`,'PENDING',0,stamp,stamp)}
function counts(d,prefix){const q=s=>Number(d.raw.prepare("SELECT COUNT(*) n FROM provider_jobs WHERE status=? AND id LIKE ?").get(s,`${prefix}-%`).n);return{pending:q('PENDING'),running:q('RUNNING'),done:q('DONE'),dead:q('DEAD_LETTER'),retry:q('RETRY')}}

async function runControlledCycle(d,prefix,at){
  seed(d,prefix,20,at);
  const starts=[];let releases=[];
  const p=runDueJobs(d,async(providerId,{job})=>{
    starts.push({id:job.id,providerId,claimedAt:job.claimed_at,leaseExpiresAt:job.lease_expires_at,executionStart:new Date().toISOString()});
    await new Promise(resolve=>releases.push(resolve));
    return{records:[],meta:{}};
  },{now:at,limit:20,concurrency:3,clock:()=>at});
  await until(()=>counts(d,prefix).running===3);
  assert.deepEqual(counts(d,prefix),{pending:17,running:3,done:0,dead:0,retry:0},'only execution slots may hold RUNNING leases');
  while(counts(d,prefix).done<20){
    await until(()=>releases.length>0);
    const before=counts(d,prefix).done,gate=releases.splice(0,releases.length);assert.ok(gate.length<=3&&gate.length>0);gate.forEach(r=>r());
    await until(()=>counts(d,prefix).done>=before+gate.length);
    if(counts(d,prefix).done<20){await until(()=>releases.length>0);assert.ok(counts(d,prefix).running<=3);assert.equal(counts(d,prefix).running,releases.length)}
  }
  const out=await p;
  assert.equal(out.length,20);
  assert.equal(starts.length,20);
  for(const s of starts)assert.ok(Date.parse(s.executionStart)<Date.parse(s.leaseExpiresAt),`${s.id} must start before lease expiry`);
  assert.deepEqual(counts(d,prefix),{pending:0,running:0,done:20,dead:0,retry:0});
  return{starts,out};
}

test('SCHEDULER_CLAIMS_JUST_IN_TIME_AT_CONCURRENCY_BOUND',async()=>{
  const d=db(),T=Date.now();
  const first=await runControlledCycle(d,'cycle-a',T);
  assert.ok(first.starts.every(s=>Date.parse(s.leaseExpiresAt)-Date.parse(s.claimedAt)===WORKER_LEASE_MS));
  const recovery=await recoverStuckJobs(d,T+WORKER_LEASE_MS*4,50);
  assert.deepEqual(recovery,{recovered:0,bounded:0});
  const second=await runControlledCycle(d,'cycle-b',T+WORKER_LEASE_MS*5);
  assert.equal(second.out.filter(x=>x.status==='DONE').length,20);
  assert.equal(Number(d.raw.prepare("SELECT COUNT(*) n FROM provider_jobs WHERE status='RUNNING'").get().n),0);
  assert.equal(Number(d.raw.prepare("SELECT COUNT(*) n FROM provider_jobs WHERE last_error='WORKER_LEASE_EXPIRED_BOUNDED'").get().n),0);
});

test('D1_HAZARD_RECORD_WRITES_BATCH_50_31_WITH_NO_INDIVIDUAL_RUN',async()=>{
  const batches=[];let individualRuns=0;
  const fake={prepare(){return{bind(...args){return{args,async run(){individualRuns++;return{meta:{changes:1}}}}}}},async batch(stmts){batches.push(stmts.length);return stmts.map(()=>({success:true}))}};
  const records=Array.from({length:81},(_,i)=>({recordId:`r${i}`,providerId:'p',providerRecordId:`pr${i}`,hazardType:'FLOOD',sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',official:true,fetchedAt:new Date().toISOString(),freshness:'FRESH'}));
  await persistHazardRecords(fake,records);
  assert.deepEqual(batches,[50,31]);
  assert.equal(individualRuns,0);
});
