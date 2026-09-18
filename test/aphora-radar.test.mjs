import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const sw=fs.readFileSync('public/service-worker.js','utf8');

test('NO_GIANT_MARKETING_HERO_ON_REPEAT_NOW',()=>{assert.doesNotMatch(html,/Qué pasa cerca tuyo|evidencia separada/i);assert.doesNotMatch(css,/font-size\s*:\s*(?:4[5-9]|[5-9]\d)px/i)});
test('RISK_SUMMARY_ABOVE_FOLD',()=>{const s=html.indexOf('id="situation-canvas"'),t=html.indexOf('id="top-relevant-panel"'),h=html.indexOf('id="hazard-overview"'),n=html.indexOf('class="bottom-nav"');assert.ok(s>0&&t>s&&h>t&&n>h)});
test('HAZARD_VISUALIZATION_PRESENT',()=>{assert.match(html,/id="hazard-bars"/);assert.match(css,/\.bar-track/);assert.match(app,/renderBars\(/)});
test('HAZARD_CHART_VALUES_MATCH_API',()=>{assert.match(app,/renderBars\(d\.countsByHazard,\$\('#hazard-bars'\)\)/);assert.match(app,/max=Math\.max\(1,\.\.\.entries\.map\(x=>Number\(x\[1\]\)\)\)/)});
test('NULL_OFFICIAL_COUNT_NOT_ZERO',()=>{assert.match(app,/nationalActiveOfficialWarnings==null\?'—':d\.nationalActiveOfficialWarnings/);assert.doesNotMatch(app,/nationalOfficialWarningCount\s*\|\|\s*0/)});
test('DEGRADED_NEVER_SAFE',()=>{assert.match(app,/DEGRADED/);assert.match(app,/Información oficial incompleta\. No podemos confirmar si hay cero alertas activas\./i);assert.doesNotMatch(app,/DEGRADED[^\n]{0,120}(?:sin alertas|seguro)/i)});
test('EVIDENCE_RAIL_PRESENT',()=>{assert.match(app,/class="evidence-rail"/);assert.match(app,/QUIÉN/);assert.match(app,/CUÁNDO/);assert.match(app,/VERIFICACIÓN/)});
test('SOURCE_ROLE_SEPARATE_FROM_VERIFICATION',()=>{assert.match(app,/const roleLabel=\{/);assert.match(app,/verificationStateLabel\(/);assert.match(app,/QUIÉN/);assert.match(app,/VERIFICACIÓN/)});
test('FRESHNESS_VISIBLE',()=>{assert.match(app,/freshnessLabel\(/);assert.match(app,/relativeTime\(/);assert.match(app,/CUÁNDO/)});
test('EVENT_ROW_USES_REAL_ID',()=>{assert.match(app,/d\.dataset\.eventId=e\.eventId/);assert.match(app,/data-detail="\$\{esc\(e\.eventId\)\}"/)});
test('OFFLINE_FAIL_CLOSED',()=>{assert.match(sw,/OFFLINE_CANNOT_VERIFY/);assert.match(sw,/canSayNoActiveOfficialWarnings:false/);assert.match(sw,/canVerifyCurrent:false/)});
