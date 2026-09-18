import fs from 'node:fs';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE='http://'+['127','0','0','1'].join('.')+':8790';
const OUT='evidence/order032-visual-final';
fs.mkdirSync(OUT,{recursive:true});
const viewports=[[320,568],[360,800],[390,844],[430,932],[768,1024],[1024,768],[1440,900]];
const fixtureEvent={eventId:'event:browser:stale-1',hazardType:'FLOOD',lifecycle:'ACTIVE',recordIds:['fixture:1'],geometry:null,bbox:[-60.75,-31.70,-60.65,-31.60],displaySeverity:null,officialWarningState:'NONE_VERIFIED',observationState:'PRESENT',modelState:'NONE',impactState:'NONE',verificationState:'VERIFICATION_DEGRADED',freshness:'STALE',firstSeenAt:'2026-08-25T10:00:00Z',lastChangedAt:'2026-08-25T10:05:00Z',expiresAt:null,dominantHeadline:'Evento de prueba E2E',plainLanguageSummary:'Dato deliberadamente desactualizado para verificar semántica.',recommendedActions:[],sourceCount:1,sources:[{recordId:'fixture:1',providerId:'fixture',sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',official:true,sourceUrl:'https://example.invalid/source',attribution:'Fixture E2E',freshness:'STALE',observedAt:'2026-08-25T10:00:00Z',issuedAt:'2026-08-25T10:00:00Z'}]};
const eventPayload={ok:true,data:{events:[fixtureEvent],count:1,limit:50,offset:0,verification:{officialWarningFeed:'DEGRADED_CANNOT_VERIFY',verifiedAt:null,activeCount:null,canSayNoActiveOfficialWarnings:false}},meta:{offline:false}};
const overviewPayload={ok:true,data:{nationalActiveOfficialWarnings:3,recentEarthquakes:2,dataMode:'DURABLE_D1',verifiedAt:'2026-08-28T10:00:00Z',verification:{officialWarningFeed:'ACTIVE_WARNINGS_VERIFIED',activeCount:3,canSayNoActiveOfficialWarnings:true}}};
const snapshotPayload={ok:true,data:{systems:[{label:'Paraná · Santa Fe',currentMetres:null,freshness:'NO_DISPONIBLE',observedAt:null}],generatedAt:'2026-08-28T07:00:00Z'},meta:{offline:false}};
const results=[];
const failures=[];
const assert=(cond,name,detail='')=>{if(!cond){failures.push({name,detail});throw new Error(name+(detail?`: ${detail}`:''))}};

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||chromium.executablePath()});
try{
  for(const [width,height] of viewports){
    const key=`${width}x${height}`;
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
    await context.addInitScript(()=>{
      window.__geoCalls=0;window.__notificationCalls=0;
      Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(_ok,err){window.__geoCalls++;setTimeout(()=>err?.({code:1,message:'denied'}),0)}}});
      class TestNotification{};TestNotification.requestPermission=async()=>{window.__notificationCalls++;return'denied'};Object.defineProperty(window,'Notification',{configurable:true,value:TestNotification});
      Object.defineProperty(window,'PushManager',{configurable:true,value:function PushManager(){}});
      const fakeReg={pushManager:{getSubscription:async()=>null,subscribe:async()=>({toJSON:()=>({endpoint:'https://fcm.googleapis.com/test',keys:{p256dh:'abcdefghijklmnopqrstuvwxyz0123456789',auth:'abcdefghijk'}})})}};
      Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{ready:Promise.resolve(fakeReg),register:async()=>fakeReg}});
    });
    const page=await context.newPage();
    const network=[];page.on('request',r=>network.push({url:r.url(),method:r.method(),type:r.resourceType()}));
    await page.route('**/api/events?*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(eventPayload)}));
    await page.route('**/api/overview',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(overviewPayload)}));
    await page.route('**/api/snapshot',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(snapshotPayload)}));
    await page.route('**/api/push/config',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{enabled:true,publicKey:'AAAA',defaults:{officialWarnings:true,modelSignals:false,satelliteEstimates:false}}})}));
    await page.route('**/api/push/subscribe',r=>r.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,data:{subscriptionId:'a'.repeat(64)}})}));
    await page.route('**/api/push/zones',r=>r.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,data:{zoneId:'zone-e2e-0001'}})}));

    await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForSelector('#event-list .event',{timeout:15000});
    const initialGeo=await page.evaluate(()=>window.__geoCalls);
    const initialNotif=await page.evaluate(()=>window.__notificationCalls);
    const initialGibs=network.filter(x=>x.url.includes('gibs.earthdata.nasa.gov')).length;
    const initialIgn=network.filter(x=>x.url.includes('wms.ign.gob.ar')).length;
    assert(initialGeo===0,`${key}:LOCATION_NOT_REQUESTED_ON_LOAD`,`calls=${initialGeo}`);
    assert(initialNotif===0,`${key}:PUSH_INITIAL_PERMISSION_ZERO`,`calls=${initialNotif}`);
    assert(initialGibs===0,`${key}:GIBS_INITIAL_REQUESTS_ZERO`,`requests=${initialGibs}`);
    assert(initialIgn===0,`${key}:INITIAL_MAP_TILES_ZERO`,`requests=${initialIgn}`);
    await page.waitForFunction(()=>document.querySelector('#national-summary')?.textContent.includes('3 alerta'));
    assert((await page.locator('#national-summary').textContent()).includes('3 alerta'),`${key}:NATIONAL_OVERVIEW_VISIBLE`);
    assert((await page.locator('#selected-location').textContent()).includes('recorte local'),`${key}:NATIONAL_LOCAL_SCOPE_SEPARATE`);

    await page.click('#use-location');
    await page.waitForFunction(()=>document.querySelector('#verification')?.textContent.includes('Ubicación denegada'));
    assert(await page.locator('#manual-location').isEnabled(),`${key}:GEOLOCATION_DENIED_APP_WORKS`);

    await page.click('#manual-location');await page.fill('#place','Santa Fe');
    const geoResp=page.waitForResponse(r=>r.url().includes('/api/georef/search')&&r.request().method()==='GET',{timeout:15000});
    await page.click('#search');
    const gr=await geoResp;assert(gr.status()===200,`${key}:MANUAL_GEOREF_HTTP`,`status=${gr.status()}`);
    await page.waitForSelector('#search-results button',{timeout:15000});
    let choice=page.locator('#search-results button').filter({hasText:'Santa Fe'}).first();if(await choice.count()===0)choice=page.locator('#search-results button').first();await choice.click();
    await page.waitForFunction(()=>document.querySelector('#selected-location')?.textContent.includes('Santa Fe'));
    await page.waitForFunction(()=>document.querySelector('#specialist-content')?.textContent.includes('—'),null,{timeout:10000});
    assert((await page.locator('#specialist-content').textContent()).includes('—'),`${key}:UNKNOWN_NUMERIC_NOT_ZERO`);
    assert(!(await page.locator('#specialist-content').textContent()).includes('0 m'),`${key}:UNKNOWN_NUMERIC_NOT_ZERO_NO_0M`);
    assert((await page.locator('#event-list').textContent()).includes('Desactualizado'),`${key}:STALE_NOT_CURRENT`);if(key==='390x844'||key==='1440x900')await page.screenshot({path:`${OUT}/${key}-DEGRADED.png`,fullPage:true});

    await page.click('nav button[data-view="map"]');
    await page.waitForSelector('#map-view:not([hidden])');
    await page.waitForTimeout(300);if(key==='390x844'||key==='1440x900')await page.screenshot({path:`${OUT}/${key}-MAP.png`,fullPage:true});
    const beforeLayerGibs=network.filter(x=>x.url.includes('gibs.earthdata.nasa.gov')).length;
    assert(beforeLayerGibs===0,`${key}:GIBS_ONLY_AFTER_LAYER_SELECTION`,`before=${beforeLayerGibs}`);
    assert(network.some(x=>x.url.includes('wms.ign.gob.ar')),`${key}:ARGENMAP_LAZY`);
    const riskBefore=network.filter(x=>x.url.includes('/geoserver/ign_riesgo/ows')).length;
    assert(riskBefore===0,`${key}:IGN_RISK_ONLY_AFTER_SELECTION`);
    await page.selectOption('#risk-layer-select','desinventar_hidrometeorologico_riesgo');
    await page.waitForFunction(()=>{const x=document.querySelector('#risk-overlay');return x&&x.getAttribute('src')?.includes('ign_riesgo')},{timeout:10000});
    const riskAfter=network.filter(x=>x.url.includes('/geoserver/ign_riesgo/ows')).length;
    assert(riskAfter>0,`${key}:IGN_RISK_LAYER_LOAD`);
    assert((await page.locator('.risk-controls').textContent()).includes('Contexto estático/histórico'),`${key}:IGN_STATIC_WARNING_VISIBLE`);if(key==='390x844'||key==='1440x900')await page.screenshot({path:`${OUT}/${key}-IGN.png`,fullPage:true});
    const listId=await page.locator('#event-list .event').first().getAttribute('data-event-id');
    const mapId=await page.locator('#map-markers [data-map-event-id]').first().getAttribute('data-map-event-id');
    assert(listId===mapId&&listId===fixtureEvent.eventId,`${key}:MAP_LIST_SAME_EVENT_SET`,`list=${listId} map=${mapId}`);
    assert(await page.locator('#events').isVisible(),`${key}:MAP_LIST_ACCESSIBLE_EQUIVALENT_LIST_VISIBLE`);
    assert(await page.locator('#event-list [data-detail]').first().isVisible(),`${key}:MAP_LIST_ACCESSIBLE_EQUIVALENT_LIST_ACTION`);
    assert(((await page.locator('#map-markers [data-map-event-id]').first().getAttribute('aria-label'))||'').includes('Ver detalle'),`${key}:MAP_MARKER_ACCESSIBLE_NAME`);
    await page.locator('#map-markers [data-map-event-id]').first().focus();await page.keyboard.press('Enter');
    assert(await page.locator('#event-detail').evaluate(d=>d.open),`${key}:MAP_EVENT_OPENS_CORRECT_DETAIL`);
    assert((await page.locator('#event-detail-content').textContent()).includes(fixtureEvent.dominantHeadline),`${key}:MAP_DETAIL_HEADLINE`);
    const dialogFocus=await page.evaluate(()=>document.querySelector('#event-detail').contains(document.activeElement));
    assert(dialogFocus,`${key}:DIALOG_FOCUS`);if(key==='390x844'||key==='1440x900')await page.screenshot({path:`${OUT}/${key}-EVENT_DETAIL.png`,fullPage:true});
    await page.keyboard.press('Escape');

    const gibsResponsePromise=page.waitForResponse(r=>r.url().includes('gibs.earthdata.nasa.gov')&&r.status()===200,{timeout:30000});
    await page.selectOption('#gibs-layer-select','imerg');
    await gibsResponsePromise;
    await page.waitForFunction(()=>{const t=document.querySelector('#gibs-time')?.textContent||'';return t.includes('Tiempo de observación/producto:')&&!t.includes('verificando')&&!t.includes('no verificable')},{timeout:30000});
    await page.waitForFunction(()=>{const x=document.querySelector('#gibs-overlay');return x&&!x.hidden&&x.getAttribute('src')?.includes('gibs.earthdata.nasa.gov')},{timeout:30000});
    const afterLayerGibs=network.filter(x=>x.url.includes('gibs.earthdata.nasa.gov')).length;
    assert(afterLayerGibs>0,`${key}:GIBS_LAYER_REAL_LOAD`,`requests=${afterLayerGibs}`);
    assert((await page.locator('#gibs-meta').textContent()).includes('NASA · dato satelital suplementario'),`${key}:GIBS_SOURCE_LABEL`);
    assert((await page.locator('#gibs-time').textContent()).match(/20\d\d-/),`${key}:GIBS_VISIBLE_TIMESTAMP`);
    const gibstext=await page.locator('#gibs-limitations').textContent();
    assert(gibstext.includes('No es una alerta oficial')&&gibstext.includes('No determina afectación actual'),`${key}:GIBS_SAFETY_VISIBLE`);if(key==='390x844'||key==='1440x900')await page.screenshot({path:`${OUT}/${key}-NASA.png`,fullPage:true});

    await page.click('nav button[data-view="zones"]');
    const openZonesNotif=await page.evaluate(()=>window.__notificationCalls);
    assert(openZonesNotif===0,`${key}:OPEN_ZONES_NOTIFICATION_PERMISSION_ZERO`,`calls=${openZonesNotif}`);
    const pushBefore=network.filter(x=>/\/api\/push\/(subscribe|zones)/.test(x.url)&&x.method!=='GET').length;
    await page.fill('#zone-name','Casa E2E');await page.click('#save-zone');
    const localZones=await page.evaluate(()=>JSON.parse(localStorage.getItem('sos-zones')||'[]'));
    assert(localZones.some(z=>z.name==='Casa E2E'),`${key}:WATCH_ZONES_LOCAL_FIRST`);
    const pushAfterSave=network.filter(x=>/\/api\/push\/(subscribe|zones)/.test(x.url)&&x.method!=='GET').length;
    assert(pushBefore===pushAfterSave,`${key}:WATCH_ZONE_NO_SERVER_WRITE_BEFORE_OPTIN`);if(key==='390x844'||key==='1440x900')await page.screenshot({path:`${OUT}/${key}-ZONES.png`,fullPage:true});
    await page.click('#push-optin');
    await page.waitForFunction(()=>window.__notificationCalls===1);
    assert((await page.locator('#push-state').textContent()).includes('La app sigue funcionando sin push'),`${key}:PUSH_DENIED_APP_WORKS`);if(key==='390x844'||key==='1440x900')await page.screenshot({path:`${OUT}/${key}-PUSH.png`,fullPage:true});
    await page.click('nav button[data-view="now"]');assert(await page.locator('#events').isVisible(),`${key}:APP_FUNCTIONAL_AFTER_PUSH_DENIED`);if(key==='390x844'||key==='1440x900'){await page.click('nav button[data-view="sources"]');await page.waitForSelector('#source-list .source');await page.screenshot({path:`${OUT}/${key}-SOURCES.png`,fullPage:true});await page.click('nav button[data-view="now"]');}

    await page.keyboard.press('Tab');
    const focus=await page.evaluate(()=>{const e=document.activeElement,s=getComputedStyle(e);return{tag:e?.tagName,id:e?.id,outline:s.outlineStyle,width:s.outlineWidth}});
    assert(focus.tag!=='BODY'&&focus.outline!=='none'&&focus.width!=='0px',`${key}:VISIBLE_FOCUS`,JSON.stringify(focus));
    await page.emulateMedia({reducedMotion:'reduce'});
    const scroll=await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior);
    assert(scroll==='auto',`${key}:REDUCED_MOTION`,`scrollBehavior=${scroll}`);

    const axe=await new AxeBuilder({page}).analyze();
    const severe=axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical');
    assert(severe.length===0,`${key}:AXE_SERIOUS_CRITICAL_ZERO`,severe.map(v=>v.id).join(','));
    assert(await page.locator('#event-list').count()===1&&await page.locator('#map-markers').count()===1,`${key}:MAP_LIST_ACCESSIBLE_EQUIVALENT`);
    await page.screenshot({path:`${OUT}/browser-${key}.png`,fullPage:true});
    results.push({viewport:key,nationalOverviewVisible:true,ignRiskRequestsAfterSelection:riskAfter,locationCallsInitial:initialGeo,notificationCallsInitial:initialNotif,notificationCallsOpenZones:openZonesNotif,gibsInitialRequests:initialGibs,gibsRequestsAfterSelection:afterLayerGibs,manualGeoRefStatus:gr.status(),mapEventId:mapId,axeSeriousCritical:severe.length,visibleFocus:focus,reducedMotionScrollBehavior:scroll,pass:true});
    await context.close();
  }

  const off=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});const p=await off.newPage();
  await p.goto(BASE+'/',{waitUntil:'networkidle',timeout:30000});
  await p.evaluate(()=>navigator.serviceWorker.ready);if(!(await p.evaluate(()=>!!navigator.serviceWorker.controller)))await p.reload({waitUntil:'networkidle',timeout:30000});
  await p.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:10000});await p.waitForTimeout(500);
  await off.setOffline(true);await p.reload({waitUntil:'domcontentloaded',timeout:30000});
  await p.waitForFunction(()=>/Sin conexión actual|No pudimos verificar/.test(document.body?.textContent||''),null,{timeout:10000});
  const offlineText=(await p.locator('body').textContent())||'';
  assert(/Sin conexión actual|No pudimos verificar/.test(offlineText),'OFFLINE_FAIL_CLOSED');
  assert(!/No hay alertas oficiales activas publicables/.test(offlineText),'OFFLINE_EMPTY_NOT_SAFE');
  results.push({offlineFailClosed:true,offlineEmptyNotSafe:true});
  await off.setOffline(false);await off.close();
} finally {await browser.close();}

const report={generatedAt:new Date().toISOString(),base:'LOCAL_WRANGLER_ISOLATED',viewports:results,failures};
fs.writeFileSync(`${OUT}/browser-gate.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
