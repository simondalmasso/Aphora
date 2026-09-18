import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('RF_DETR_FUTURE_CONTRACT_IS_SUPPLEMENTARY_ONLY_AND_RUNTIME_FREE',()=>{
  assert.equal(fs.existsSync('docs/lab/APHORA-VISUAL-OBSERVATION-CONTRACT.md'),true);
  const x=fs.readFileSync('docs/lab/APHORA-VISUAL-OBSERVATION-CONTRACT.md','utf8');
  for(const field of ['provider','model','modelVersion','observationType','geometry','confidence','observedAt','processedAt','sourceMediaUrl','sourceRole','verificationState','provenance'])assert.match(x,new RegExp('\\b'+field+'\\b'));
  assert.match(x,/SUPPLEMENTARY_EXTERNAL_OBSERVATION/);
  assert.match(x,/water_extent/);
  assert.match(x,/smoke/);
  assert.match(x,/fire/);
  assert.match(x,/flooded_road/);
  assert.match(x,/debris/);
  assert.match(x,/MUST NOT.*OFFICIAL_WARNING/is);
  assert.match(x,/MUST NOT.*severity/is);
  assert.match(x,/MUST NOT.*impact/is);
  assert.match(x,/MUST NOT.*recommendedActions/is);
  assert.match(x,/zero runtime dependency/i);
  assert.doesNotMatch(x,/pip install|npm install|roboflow api key|cuda==|torch==/i);
});
