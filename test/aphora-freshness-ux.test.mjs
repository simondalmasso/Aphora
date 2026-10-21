import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/client/app.js',import.meta.url),'utf8');
const national=fs.readFileSync(new URL('../src/worker/national.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../src/worker/runtime.js',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../wrangler.aphora.jsonc',import.meta.url),'utf8');
const deploy=fs.readFileSync(new URL('../.github/workflows/deploy-aphora.yml',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
const schedulerWorkflow=fs.readFileSync(new URL('../.github/workflows/aphora-scheduler.yml',import.meta.url),'utf8');

test('TERRITORIAL_OVERVIEW_DOES_NOT_DEPEND_ON_WEATHER_FORECAST',()=>{
  for(const token of ['visibilityAtOrBefore','api.open-meteo.com','weather-hero','weatherThemeFromCurrent','WEATHER_CACHE_KEY'])assert.ok(!app.includes(token),token);
  assert.ok(!css.includes('data-weather-theme='));
  assert.ok(!css.includes('.weather-hero'));
  assert.ok(!css.includes('weather-first redesign'));
});

test('EXPIRED_DURABLE_EVENTS_ARE_EXCLUDED_FROM_CURRENT_OVERVIEW_AND_LOCAL_FEED',()=>{
  assert.match(national,/function eventIsCurrent\(/);
  assert.match(national,/eventIsCurrent\(e/);
  assert.match(national,/now-stamp>7\*86400000/);
  assert.match(national,/age>6\*3600000/);
  assert.match(app,/relativeTime\(d\.verifiedAt\)/);
});

test('SEISMIC_COUNTS_EXPLICITLY_STATE_THE_SEVEN_DAY_WINDOW',()=>{
  assert.ok(app.includes('<span>sismos (7 días)</span>'));
  assert.doesNotMatch(app,/sismos vigentes/);
  assert.ok(national.includes('now.getTime()-7*86400000'));
  assert.ok(national.includes('cut=now.getTime()-7*86400000'));
});

test('RIVER_STATIONS_OVER_100_KM_ARE_NOT_LABELLED_NEARBY',()=>{
  assert.match(app,/distanceKm<=100/);
  assert.match(app,/ESTACIONES REGIONALES/);
  assert.match(app,/RÍOS A MENOS DE 100 KM/);
});

test('TERRITORIAL_UI_USES_A_STABLE_CIVIC_PALETTE',()=>{
  assert.ok(css.includes('--brand:#173e63'));
  assert.ok(css.includes('.territory-intro'));
  assert.ok(!css.includes('data-weather-theme='));
  assert.ok(!css.includes('.weather-hero'));
  assert.ok(!css.includes('.weather-daily-summary'));
});

test('APHORA_SCHEDULER_IS_FIVE_MINUTES_AND_STAYS_WITHIN_FREE_D1_BUDGET',()=>{
  assert.match(config,/"crons":\[\]/);
  assert.ok(schedulerWorkflow.includes('cron: "*/5 * * * *"'));
  assert.ok(schedulerWorkflow.includes('/api/internal/scheduled-cycle'));
  assert.ok(schedulerWorkflow.includes('APHORA_SCHEDULER_TOKEN'));
  assert.ok(deploy.includes('APHORA_SCHEDULER_TOKEN'));
  assert.match(runtime,/MAX_JOBS_PER_CYCLE=3/);
  const budget=fs.readFileSync(new URL('../scripts/d1-budget-24h.mjs',import.meta.url),'utf8');
  assert.match(budget,/fixedRows<=2_500_000/);
  assert.doesNotMatch(deploy,/Stripe|Paddle|LemonSqueezy|payment provider|checkout_url/i);
});
