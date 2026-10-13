import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker/index.js';

const endpoint='https://aphora.test/api/internal/scheduled-cycle';

test('EXTERNAL_SCHEDULER_ACCEPTS_ONLY_AUTHENTICATED_POST',async()=>{
  const env={APHORA_SCHEDULER_TOKEN:'scheduler-fixture-token-that-is-long-enough-0123456789'};
  const get=await worker.fetch(new Request(endpoint,{method:'GET'}),env);
  assert.equal(get.status,405);
  const missing=await worker.fetch(new Request(endpoint,{method:'POST'}),{});
  assert.equal(missing.status,503);
  const denied=await worker.fetch(new Request(endpoint,{method:'POST',headers:{authorization:'Bearer wrong'}}),env);
  assert.equal(denied.status,401);
});

test('EXTERNAL_SCHEDULER_AUTHENTICATED_CALL_REACHES_DURABLE_CYCLE',async()=>{
  const response=await worker.fetch(new Request(endpoint,{method:'POST',headers:{authorization:'Bearer scheduler-fixture-token-that-is-long-enough-0123456789'}}),{APHORA_SCHEDULER_TOKEN:'scheduler-fixture-token-that-is-long-enough-0123456789'});
  assert.equal(response.status,503);
  const payload=await response.json();
  assert.equal(payload.ok,false);
  assert.equal(payload.error.code,'SCHEDULER_CYCLE_FAILED');
  assert.doesNotMatch(JSON.stringify(payload),/D1_BINDING_REQUIRED|scheduler-fixture-token-that-is-long-enough-0123456789/);
});
