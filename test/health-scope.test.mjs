import test from'node:test';
import assert from'node:assert/strict';
import {enhancedHealth} from'../src/worker/national.js';

test('LEGACY_HEALTH_NO_FALSE_NATIONAL_SAFE',async()=>{const legacy={fetch:async()=>new Response(JSON.stringify({data:{snapshot:{alertStatus:'SIN_ALERTAS_OFICIALES_DETECTADAS'}}}),{headers:{'content-type':'application/json'}})},r=await enhancedHealth(legacy,{}),x=await r.json();assert.equal(x.data.legacy.legacyAlertStatusNotNational,true);assert.equal(x.data.legacy.legacySpecialistScope,'SANTA_FE_HYDROLOGY');assert.equal(x.data.legacy.snapshot.alertStatus,'LEGACY_SPECIALIST_STATUS_NOT_NATIONAL');assert.equal(JSON.stringify(x).includes('SIN_ALERTAS_OFICIALES_DETECTADAS'),false)});
