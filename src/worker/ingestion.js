import{eventMaterialSignature}from'../domain/hazard.js';
export const INGESTION_MODE='SINGLE_CRON_PLUS_D1_DURABLE_JOB_TABLE';
export const WORKER_LEASE_MS=2*60*1000;
export const MAX_RUNTIME_RECOVERIES=2;
export const WORKER_LEASE_EXPIRY='WORKER_LEASE_EXPIRED';
export const RETENTION_INTERVAL_MS=60*60*1000;
export const CADENCE_SECONDS=Object.freeze({'smn-cap':300,ina:900,inpres:900,'usgs-earthquake':900,'nasa-eonet':1800,'nasa-gpm':1800});
export function projectedOperationsDay(){const providerJobs=Object.values(CADENCE_SECONDS).reduce((n,s)=>n+Math.ceil(86400/s),0),cronCycles=Math.ceil(86400/300);const d1Writes=providerJobs*16+cronCycles*12;return{providerJobs,cronCycles,queueOps:0,workerRequests:cronCycles,d1Writes,d1WritesUpperBound:d1Writes,mode:INGESTION_MODE}}
export function nextRetry(attempt,now=Date.now()){if(attempt>=4)return null;return new Date(now+Math.min(3600000,30000*2**attempt)).toISOString()}
const iso=v=>new Date(v).toISOString();
export function scheduledBucketId(providerId,at){const seconds=CADENCE_SECONDS[providerId]||300,bucket=Math.floor(Number(at)/1000/seconds)*seconds;return`${providerId}:${new Date(bucket*1000).toISOString()}`}
export async function ensureProviderRegistry(db,now=Date.now()){if(!db)return;for(const[providerId,seconds]of Object.entries(CADENCE_SECONDS))await db.prepare("INSERT INTO provider_registry(provider_id,next_due_at,refresh_seconds,failure_count,status) VALUES(?,?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET refresh_seconds=excluded.refresh_seconds").bind(providerId,iso(now),seconds,0,'READY').run()}
export async function scheduleDueProviders(db,now=Date.now(),limit=20){if(!db)return[];await ensureProviderRegistry(db,now);const stamp=iso(now),rows=(await db.prepare("SELECT provider_id,refresh_seconds,failure_count,circuit_open_until FROM provider_registry WHERE next_due_at<=? AND (circuit_open_until IS NULL OR circuit_open_until<=?) ORDER BY next_due_at LIMIT ?").bind(stamp,stamp,limit).all()).results||[],scheduled=[];for(const row of rows){const next=iso(now+Number(row.refresh_seconds)*1000),id=scheduledBucketId(row.provider_id,now);const claim=await db.prepare("UPDATE provider_registry SET next_due_at=?,last_attempt_at=?,status='SCHEDULED' WHERE provider_id=? AND next_due_at<=? AND NOT EXISTS (SELECT 1 FROM provider_jobs WHERE provider_id=? AND status IN ('PENDING','RETRY','RUNNING'))").bind(next,stamp,row.provider_id,stamp,row.provider_id).run();if((claim.meta?.changes??0)<1)continue;const ins=await db.prepare("INSERT OR IGNORE INTO provider_jobs(id,provider_id,status,attempts,next_attempt_at,created_at,runtime_recovery_count) VALUES(?,?,?,?,?,?,0)").bind(id,row.provider_id,'PENDING',0,stamp,stamp).run();if((ins.meta?.changes??0)>0)scheduled.push(id)}return scheduled}
export async function recoverStuckJobs(db,now=Date.now(),limit=20){if(!db)return{recovered:0,bounded:0};const stamp=iso(now);const expired=(await db.prepare("SELECT id,provider_id,runtime_recovery_count FROM provider_jobs WHERE status='RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at<=? ORDER BY lease_expires_at LIMIT ?").bind(stamp,limit).all()).results||[];let recovered=0,bounded=0;for(const row of expired){const count=Number(row.runtime_recovery_count||0);if(count>=MAX_RUNTIME_RECOVERIES){const r=await db.prepare("UPDATE provider_jobs SET status='DEAD_LETTER',finished_at=?,last_error='WORKER_LEASE_EXPIRED_BOUNDED',claimed_at=NULL,lease_expires_at=NULL,last_runtime_recovery_at=? WHERE id=? AND status='RUNNING' AND lease_expires_at<=?").bind(stamp,stamp,row.id,stamp).run();bounded+=(r.meta?.changes??0);continue}const r=await db.prepare("UPDATE provider_jobs SET status='RETRY',next_attempt_at=?,last_error=?,runtime_recovery_count=runtime_recovery_count+1,last_runtime_recovery_at=?,claimed_at=NULL,lease_expires_at=NULL WHERE id=? AND status='RUNNING' AND lease_expires_at<=?").bind(stamp,WORKER_LEASE_EXPIRY,stamp,row.id,stamp).run();recovered+=(r.meta?.changes??0)}return{recovered,bounded}}
export async function claimDueJobs(db,now=new Date().toISOString(),limit=20){if(!db)return[];const nowMs=Date.parse(now),leaseExpires=iso((Number.isFinite(nowMs)?nowMs:Date.now())+WORKER_LEASE_MS),rows=(await db.prepare("SELECT id,provider_id,attempts,runtime_recovery_count FROM provider_jobs WHERE status IN ('PENDING','RETRY') AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT ?").bind(now,limit).all()).results||[],claimed=[];for(const row of rows){const x=await db.prepare("UPDATE provider_jobs SET status='RUNNING',claimed_at=?,lease_expires_at=?,finished_at=NULL WHERE id=? AND status IN ('PENDING','RETRY') AND next_attempt_at<=?").bind(now,leaseExpires,row.id,now).run();if((x.meta?.changes??0)>0)claimed.push({...row,claimed_at:now,lease_expires_at:leaseExpires})}return claimed}
export async function persistProviderVerification(db,providerId,v={},now=Date.now()){if(!db)return;const stamp=iso(now),state=String(v.state||'UNKNOWN').slice(0,80),payload=JSON.stringify({...v,providerId});await db.prepare("INSERT INTO provider_verification(provider_id,state,verified_at,active_count,can_say_no_active,parse_failures,feed_item_count,error_class,payload_json,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET state=excluded.state,verified_at=excluded.verified_at,active_count=excluded.active_count,can_say_no_active=excluded.can_say_no_active,parse_failures=excluded.parse_failures,feed_item_count=excluded.feed_item_count,error_class=excluded.error_class,payload_json=excluded.payload_json,updated_at=excluded.updated_at").bind(providerId,state,v.fetchedAt||v.verifiedAt||stamp,v.activeCount??null,v.canSayNoActiveOfficialWarnings===true?1:v.canSayNoActiveOfficialWarnings===false?0:null,v.parseFailures??null,v.feedItemCount??v.rowCount??v.featureCount??v.eventCount??null,v.errorClass||null,payload,stamp).run()}
export async function finishJob(db,id,providerId,ok,attempts,errorClass=null,meta={},now=Date.now()){if(!db)return;const stamp=iso(now);if(ok){const degraded=String(meta.verification?.state||'').startsWith('DEGRADED');await db.prepare("UPDATE provider_jobs SET status='DONE',finished_at=?,last_error=NULL,claimed_at=NULL,lease_expires_at=NULL WHERE id=?").bind(stamp,id).run();await db.prepare("UPDATE provider_registry SET last_success_at=?,last_observed_at=COALESCE(?,last_observed_at),failure_count=0,circuit_open_until=NULL,etag=COALESCE(?,etag),last_modified=COALESCE(?,last_modified),last_payload_hash=COALESCE(?,last_payload_hash),status=?,error_class=? WHERE provider_id=?").bind(stamp,meta.observedAt||null,meta.etag||null,meta.lastModified||null,meta.rawHash||null,degraded?'DEGRADED':'FRESH',degraded?(meta.verification?.state||'DEGRADED'):null,providerId).run();if(meta.verification)await persistProviderVerification(db,providerId,meta.verification,now);return}const retry=nextRetry(attempts,now),err=String(errorClass||'TRANSIENT').slice(0,80);if(retry){await db.prepare("UPDATE provider_jobs SET status='RETRY',attempts=?,next_attempt_at=?,last_error=?,claimed_at=NULL,lease_expires_at=NULL WHERE id=?").bind(attempts+1,retry,err,id).run();await db.prepare("UPDATE provider_registry SET failure_count=failure_count+1,status='DEGRADED',error_class=? WHERE provider_id=?").bind(err,providerId).run()}else{const open=iso(now+3600000);await db.prepare("UPDATE provider_jobs SET status='DEAD_LETTER',attempts=?,finished_at=?,last_error=?,claimed_at=NULL,lease_expires_at=NULL WHERE id=?").bind(attempts+1,stamp,err,id).run();await db.prepare("UPDATE provider_registry SET failure_count=failure_count+1,circuit_open_until=?,status='CIRCUIT_OPEN',error_class=? WHERE provider_id=?").bind(open,err,providerId).run()}await persistProviderVerification(db,providerId,{state:'DEGRADED_UNAVAILABLE',fetchedAt:stamp,errorClass:err},now)}

const HAZARD_RECORD_BATCH_SIZE=50;
const EXECUTION_CONCURRENCY=3;
export async function persistHazardRecords(db,records=[]){
  if(!db)return;
  const sql="INSERT INTO hazard_records(record_id,provider_id,provider_record_id,hazard_type,source_role,official,issued_at,observed_at,expires_at,fetched_at,freshness,raw_hash,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(record_id) DO UPDATE SET provider_id=excluded.provider_id,provider_record_id=excluded.provider_record_id,hazard_type=excluded.hazard_type,source_role=excluded.source_role,official=excluded.official,issued_at=excluded.issued_at,observed_at=excluded.observed_at,expires_at=excluded.expires_at,fetched_at=excluded.fetched_at,freshness=excluded.freshness,raw_hash=excluded.raw_hash,payload_json=excluded.payload_json";
  const statements=records.slice(0,500).map(r=>{const payload=JSON.stringify(r),rawHash=String(r.rawHash||`record:${r.recordId}`);return db.prepare(sql).bind(r.recordId,r.providerId,r.providerRecordId,r.hazardType,r.sourceRole,r.official?1:0,r.issuedAt||null,r.observedAt||null,r.expiresAt||null,r.fetchedAt,r.freshness||'UNAVAILABLE',rawHash,payload)});
  for(let i=0;i<statements.length;i+=HAZARD_RECORD_BATCH_SIZE){const batch=statements.slice(i,i+HAZARD_RECORD_BATCH_SIZE);if(typeof db.batch==='function')await db.batch(batch);else for(const stmt of batch)await stmt.run()}
}
export async function runDueJobs(db,handler,{now=Date.now(),limit=20,concurrency=EXECUTION_CONCURRENCY,clock=Date.now}={}){
  if(!db)throw new Error('D1_BINDING_REQUIRED_FOR_CANONICAL_DURABLE_MODE');
  await recoverStuckJobs(db,now,limit);
  const out=[];let remaining=Math.max(0,Number(limit)||0),batchIndex=0;
  const slots=Math.max(1,Math.min(EXECUTION_CONCURRENCY,Number(concurrency)||EXECUTION_CONCURRENCY));
  while(remaining>0){
    const claimTime=Number(clock()),jobs=await claimDueJobs(db,iso(claimTime),Math.min(slots,remaining));
    if(!jobs.length)break;
    remaining-=jobs.length;
    await Promise.all(jobs.map(async job=>{const executionStart=Number(clock());try{
      const result=await handler(job.provider_id,{job,db,now,executionStart,batchIndex});
      await persistHazardRecords(db,result.records||[]);
      const completedAt=Number(clock());
      await finishJob(db,job.id,job.provider_id,true,job.attempts,null,result.meta||{},completedAt);
      out.push({id:job.id,providerId:job.provider_id,status:'DONE',records:(result.records||[]).length,claimedAt:job.claimed_at,executionStartedAt:iso(executionStart),leaseExpiresAt:job.lease_expires_at,completedAt:iso(completedAt)});
    }catch(error){
      const completedAt=Number(clock()),errorClass=String(error?.message||'PROVIDER_FAILED').slice(0,80);
      await finishJob(db,job.id,job.provider_id,false,job.attempts,errorClass,{},completedAt);
      out.push({id:job.id,providerId:job.provider_id,status:'RETRY_OR_DEAD',errorClass,claimedAt:job.claimed_at,executionStartedAt:iso(executionStart),leaseExpiresAt:job.lease_expires_at,completedAt:iso(completedAt)});
    }}));
    batchIndex++;
  }
  return out.sort((a,b)=>a.providerId.localeCompare(b.providerId)||a.id.localeCompare(b.id));
}

async function versionIfChanged(db,event,stamp){
  const old=await db.prepare('SELECT payload_json,lifecycle FROM hazard_events WHERE event_id=?').bind(event.eventId).first();
  let changed=!old;
  if(old){
    try{changed=eventMaterialSignature(JSON.parse(old.payload_json))!==eventMaterialSignature(event)||old.lifecycle!==event.lifecycle}catch{changed=true}
  }
  if(changed)await db.prepare('INSERT INTO event_versions(event_id,changed_at,payload_json) VALUES(?,?,?)').bind(event.eventId,stamp,JSON.stringify(event)).run();
  return changed;
}
export async function persistHazardEvents(db,events=[],now=Date.now()){
  const stamp=iso(now),ids=new Set();
  for(const e of events.slice(0,500)){
    ids.add(e.eventId);
    await versionIfChanged(db,e,stamp);
    await db.prepare("INSERT INTO hazard_events(event_id,hazard_type,lifecycle,verification_state,first_seen_at,last_changed_at,expires_at,payload_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET hazard_type=excluded.hazard_type,lifecycle=excluded.lifecycle,verification_state=excluded.verification_state,last_changed_at=excluded.last_changed_at,expires_at=excluded.expires_at,payload_json=excluded.payload_json")
      .bind(e.eventId,e.hazardType,e.lifecycle,e.verificationState,e.firstSeenAt||stamp,e.lastChangedAt||stamp,e.expiresAt||null,JSON.stringify(e)).run();
    await db.prepare('DELETE FROM event_record_links WHERE event_id=?').bind(e.eventId).run();
    for(const rid of (e.recordIds||[]).slice(0,100))await db.prepare('INSERT OR IGNORE INTO event_record_links(event_id,record_id) VALUES(?,?)').bind(e.eventId,rid).run();
  }
  const active=(await db.prepare("SELECT event_id,payload_json FROM hazard_events WHERE lifecycle='ACTIVE' ORDER BY last_changed_at DESC LIMIT 500").all()).results||[];
  for(const row of active){
    if(ids.has(row.event_id))continue;
    let old;
    try{old=JSON.parse(row.payload_json)}catch{old={eventId:row.event_id,hazardType:'UNKNOWN'}}
    const closed={...old,lifecycle:'INACTIVE',lastChangedAt:stamp};
    await versionIfChanged(db,closed,stamp);
    await db.prepare("UPDATE hazard_events SET lifecycle='INACTIVE',last_changed_at=?,payload_json=? WHERE event_id=?").bind(stamp,JSON.stringify(closed),row.event_id).run();
  }
  return events.length;
}
export async function writeHeartbeat(db,data={},now=Date.now()){
  const stamp=iso(now),payload=JSON.stringify({...data,at:stamp});
  await db.prepare("INSERT INTO runtime_state(key,payload_json,updated_at) VALUES('scheduler:last_cycle',?,?) ON CONFLICT(key) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at").bind(payload,stamp).run();
}
export async function cleanupRetention(db,now=Date.now(),limit=100){
  const stamp=iso(now),gate=await db.prepare("SELECT updated_at FROM runtime_state WHERE key='cleanup:retention' LIMIT 1").first();
  if(gate?.updated_at&&Number.isFinite(Date.parse(gate.updated_at))&&now-Date.parse(gate.updated_at)<RETENTION_INTERVAL_MS)return 0;
  const jobs=iso(now-7*86400000),versions=iso(now-30*86400000),deliveries=iso(now-30*86400000),records=iso(now-45*86400000),rates=iso(now-2*86400000);
  let changes=0;
  const ops=[
    ["DELETE FROM provider_jobs WHERE id IN (SELECT id FROM provider_jobs WHERE status IN ('DONE','DEAD_LETTER') AND finished_at<? ORDER BY finished_at LIMIT ?)",jobs],
    ["DELETE FROM event_versions WHERE id IN (SELECT id FROM event_versions WHERE changed_at<? ORDER BY changed_at LIMIT ?)",versions],
    ["DELETE FROM notification_deliveries WHERE id IN (SELECT id FROM notification_deliveries WHERE created_at<? ORDER BY created_at LIMIT ?)",deliveries],
    ["DELETE FROM notification_snapshots WHERE delivery_id IN (SELECT delivery_id FROM notification_snapshots WHERE created_at<? ORDER BY created_at LIMIT ?)",deliveries],
    ["DELETE FROM hazard_records WHERE record_id IN (SELECT record_id FROM hazard_records WHERE fetched_at<? AND (expires_at IS NULL OR expires_at<?) ORDER BY fetched_at LIMIT ?)",records,stamp],
    ["DELETE FROM push_rate_limits WHERE bucket IN (SELECT bucket FROM push_rate_limits WHERE updated_at<? ORDER BY updated_at LIMIT ?)",rates]
  ];
  for(const op of ops){const[q,...args]=op;const r=await db.prepare(q).bind(...args,limit).run();changes+=r.meta?.changes??0}
  await db.prepare("INSERT INTO runtime_state(key,payload_json,updated_at) VALUES('cleanup:retention','{}',?) ON CONFLICT(key) DO UPDATE SET updated_at=excluded.updated_at").bind(stamp).run();
  return changes;
}
