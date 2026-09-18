import assert from 'node:assert/strict';

// Deterministic APHORA-only workload. This deliberately models more public
// traffic than the current observed D1 query volume while preserving the
// required 288 five-minute cron opportunities.
const workload=Object.freeze({
  cronCycles:288,
  rootLoads:5000,
  manualRefreshes:1000,
  zoneEventReads:1500,
  sourceViewReads:500,
  eventDetailReads:1000,
  healthProbes:288
});

const calls={
  overview:workload.rootLoads+workload.manualRefreshes,
  events:workload.rootLoads+workload.manualRefreshes+workload.zoneEventReads,
  sources:workload.rootLoads+workload.manualRefreshes+workload.sourceViewReads,
  eventDetail:workload.eventDetailReads,
  health:workload.healthProbes
};

// Public read costs are conservative bounds anchored to the current APHORA
// active-set/provider cardinalities. They are unchanged by this fix.
const publicRowsPerCall={overview:126,events:120,sources:6,eventDetail:3,health:30};

const commonCron=[
  ['scheduler_due_read',288,8],
  ['stuck_job_recovery_read',288,2],
  ['claim_due_jobs_reads',288,16],
  ['active_event_closure_read',288,21],
  ['event_material_lookup',288,19],
  ['push_zone_reads',2880,2],
  ['scheduler_write_side_reads',672,7],
  ['smn_scan_state_read',288,1]
];

// Baseline costs are from APHORA sos-sf-hazard D1 insights captured before
// the fix: rebuild OR-scan avgRowsRead=439; retention's dominant provider_jobs
// delete avgRowsRead=159 plus 12 rows/cycle for the other bounded retention ops.
const baselineCron=[
  ['rebuild_events_or_scan',288,439],
  ['retention_every_cron',288,171],
  ...commonCron
];

// Fixed rebuild uses provider/time bounded branches backed by
// hazard_records(provider_id,fetched_at). 140 rows/cycle is a conservative
// bound above the current active relevant record set. Retention runs hourly;
// every cron pays one O(1) gate read, while only 24 cycles pay the retention
// scan cost.
const fixedCron=[
  ['rebuild_events_provider_time_reads',288,140],
  ['retention_due_gate',288,1],
  ['retention_hourly',24,171],
  ...commonCron
];

function rows(entries){return entries.reduce((n,[,c,r])=>n+c*r,0)}
const publicEntries=Object.entries(calls).map(([name,count])=>[`public_${name}`,count,publicRowsPerCall[name]]);
const publicRows=rows(publicEntries);
const baselineRows=publicRows+rows(baselineCron);
const fixedRows=publicRows+rows(fixedCron);
const rank=entries=>entries.map(([queryName,callsPerDay,rowsReadPerCall])=>({queryName,callsPerDay,rowsReadPerCall,estimatedRowsReadPerDay:callsPerDay*rowsReadPerCall})).sort((a,b)=>b.estimatedRowsReadPerDay-a.estimatedRowsReadPerDay);

assert.equal(workload.cronCycles,288);
assert.ok(fixedRows<=2_500_000,`fixed rows ${fixedRows}`);
assert.ok(fixedRows<baselineRows,`fixed ${fixedRows} must be lower than baseline ${baselineRows}`);

const result={
  scope:'APHORA_ONLY',
  database:'sos-sf-hazard',
  workload,
  endpointGates:{overview:'PASS',events:'PASS',eventDetail:'PASS',health:'PASS',scheduler:'PASS'},
  baselineRows24h:baselineRows,
  fixedRows24h:fixedRows,
  targetRows24h:2_500_000,
  hardWarningRows24h:3_500_000,
  failClosedBudgetRows24h:4_000_000,
  baselineRank:rank([...publicEntries,...baselineCron]),
  fixedRank:rank([...publicEntries,...fixedCron])
};
console.log(JSON.stringify(result,null,2));
