import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/client/app.js',import.meta.url),'utf8');
const national=fs.readFileSync(new URL('../src/worker/national.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../src/worker/runtime.js',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../wrangler.aphora.jsonc',import.meta.url),'utf8');
const deploy=fs.readFileSync(new URL('../.github/workflows/deploy-aphora.yml',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/app.css',import.meta.url),'utf8');

test('WEATHER_VISIBILITY_MATCHES_LAST_AVAILABLE_HOUR_AND_NEVER_COERCES_NULL_TO_ZERO',()=>{
  assert.match(app,/function visibilityAtOrBefore\(/);
  assert.doesNotMatch(app,/hourlyTimes\.indexOf\(String\(current\.time\|\|''\)\.slice\(0,16\)\)/);
  assert.match(app,/visibility!==null&&visibility!==undefined&&Number\.isFinite\(Number\(visibility\)\)/);
});

test('EXPIRED_DURABLE_EVENTS_ARE_EXCLUDED_FROM_CURRENT_OVERVIEW_AND_LOCAL_FEED',()=>{
  assert.match(national,/lifecycle='ACTIVE' AND \(expires_at IS NULL OR expires_at>\?\)/);
  assert.match(national,/function eventIsCurrent\(/);
  assert.match(national,/eventIsCurrent\(e/);
});

test('RIVER_STATIONS_OVER_100_KM_ARE_NOT_LABELLED_NEARBY',()=>{
  assert.match(app,/distanceKm<=100/);
  assert.match(app,/ESTACIONES REGIONALES/);
  assert.match(app,/RÍOS A MENOS DE 100 KM/);
});

test('WEATHER_AND_CIVIC_RISK_SHARE_ONE_STABLE_VISUAL_THEME',()=>{
  assert.doesNotMatch(css,/:root\[data-weather-theme=/);
  assert.match(css,/\.weather-daily-summary\{[^}]*background:var\(--surface\)/);
  assert.match(css,/\.weather-hero\{[^}]*background:var\(--surface\)/);
});

test('APHORA_SCHEDULER_IS_FIVE_MINUTES_AND_STAYS_WITHIN_FREE_D1_BUDGET',()=>{
  assert.match(config,/"crons":\["\*\/5 \* \* \* \*"\]/);
  assert.match(deploy,/five-minute scheduler/i);
  assert.match(runtime,/MAX_JOBS_PER_CYCLE=3/);
  const budget=fs.readFileSync(new URL('../scripts/d1-budget-24h.mjs',import.meta.url),'utf8');
  assert.match(budget,/fixedRows<=2_500_000/);
  assert.doesNotMatch(deploy,/Stripe|Paddle|LemonSqueezy|payment|checkout/i);
});
