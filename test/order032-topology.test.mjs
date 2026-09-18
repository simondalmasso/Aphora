import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const scheduler=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
const publicWorker=JSON.parse(fs.readFileSync('wrangler.aphora.jsonc','utf8'));

test('ONE_ACTIVE_SCHEDULER_TOPOLOGY',()=>{
  assert.equal(scheduler.name,'sos-sf');
  assert.deepEqual(scheduler.triggers?.crons,['*/5 * * * *']);
  assert.equal(publicWorker.name,'aphora');
  assert.ok(!publicWorker.triggers||!Array.isArray(publicWorker.triggers.crons)||publicWorker.triggers.crons.length===0);
});

test('APHORA_PUBLIC_WORKER_USES_CANONICAL_HAZARD_DB_WITHOUT_PRIVATE_BINDING',()=>{
  assert.deepEqual(publicWorker.d1_databases,scheduler.d1_databases);
  const binding=publicWorker.d1_databases?.[0];
  assert.equal(binding?.binding,'HAZARD_DB');
  assert.equal(binding?.database_name,'sos-sf-hazard');
  assert.equal(binding?.database_id,'4d31e216-0b73-4dba-ae59-56e74e4566e9');
  const text=fs.readFileSync('wrangler.aphora.jsonc','utf8');
  assert.doesNotMatch(text,/MESSAGES_DB|private.*database/i);
  assert.equal(publicWorker.vars?.PRIVATE_MESSAGING_ENABLED,'false');
  assert.equal(publicWorker.vars?.COMMUNITY_REPORTING_ENABLED,'false');
});
