import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

const BASE='http://127.0.0.1:8790';
const OUT='evidence/aphora-current-browser';
fs.mkdirSync(OUT,{recursive:true});
const now=Date.now(),iso=at=>new Date(at).toISOString();
const event={
  eventId:'event:qa:quake-1',hazardType:'EARTHQUAKE',lifecycle:'ACTIVE',
  geometry:{type:'Point',coordinates:[-62.3,-33.0]},bbox:[-62.32,-33.02,-62.28,-32.98],
  provinces:['Santa Fe'],regions:['Santa Fe'],officialWarningState:'NONE_VERIFIED',
  observationState:'PRESENT',verificationState:'VERIFIED_MACHINE',freshness:'FRESH',
  firstSeenAt:iso(now-120000),lastChangedAt:iso(now-60000),expiresAt:iso(now+48*3600000),
  dominantHeadline:'Sismo observado · prueba de interfaz',plainLanguageSummary:'Observación de prueba con vigencia verificable.',
  sourceCount:1,records:[],sources:[{recordId:'inpres:qa-1',providerId:'inpres',sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',sourceOrganization:'INPRES',official:true,verificationState:'VERIFIED_MACHINE',freshness:'FRESH',observedAt:iso(now-60000),issuedAt:iso(now-60000),fetchedAt:iso(now-30000),sourceUrl:'https://www.inpres.gob.ar/'}]
};
const verification={officialWarningFeed:'ACTIVE_WARNINGS_VERIFIED',verifiedAt:iso(now-30000),activeCount:1,canSayNoActiveOfficialWarnings:true};
const overview={ok:true,data:{dataPlane:'FIXTURE',generatedAt:iso(now),verifiedAt:verification.verifiedAt,nationalEventCount:1,nationalActiveOfficialWarnings:1,recentEarthquakeCount:1,recentEarthquakes:1,activeZoneCount:1,countsByHazard:{EARTHQUAKE:1},countsByProvince:{'Santa Fe':1},situationEvents:[{eventId:event.eventId,hazardType:event.hazardType,geometry:event.geometry,bbox:event.bbox,provinces:event.provinces,regions:event.regions,officialWarningState:event.officialWarningState,observationState:event.observationState,verificationState:event.verificationState,displaySeverity:null,capSeverity:null,sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',sourceOrganization:'INPRES',freshness:'FRESH',observedAt:event.sources[0].observedAt,issuedAt:event.sources[0].issuedAt,fetchedAt:event.sources[0].fetchedAt,lastChangedAt:event.lastChangedAt}],verification,providerVerification:{}}};
const eventList={ok:true,data:{events:[event],count:1,limit:50,offset:0,verification},meta:{dataPlane:'FIXTURE'}};
const observations=[
 {observationId:'obs:near',observationType:'RIVER_LEVEL',hazardType:'FLOOD',providerId:'ina',sourceOrganization:'Instituto Nacional del Agua',sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',label:'Río de referencia',locationLabel:'Estación cercana de prueba',geometry:{type:'Point',coordinates:[-62.2,-33.0]},value:2.4,unit:'m',delta24h:0.03,trend:'RISING',observedAt:iso(now-3600000),fetchedAt:iso(now-30000),freshness:'FRESH',verificationState:'PUBLISHED_OPERATIONAL',ageMinutes:60},
 {observationId:'obs:regional',observationType:'RIVER_LEVEL',hazardType:'FLOOD',providerId:'ina',sourceOrganization:'Instituto Nacional del Agua',sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',label:'Río regional',locationLabel:'Estación regional de prueba',geometry:{type:'Point',coordinates:[-60.7,-31.63]},value:3.1,unit:'m',delta24h:null,trend:'UNKNOWN',observedAt:iso(now-3600000),fetchedAt:iso(now-30000),freshness:'FRESH',verificationState:'PUBLISHED_OPERATIONAL',ageMinutes:60},
  {observationId:'obs:unknown-distance',observationType:'RIVER_LEVEL',hazardType:'FLOOD',providerId:'ina',sourceOrganization:'Instituto Nacional del Agua',sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',label:'Estación sin coordenadas verificables',locationLabel:'Estación sin ubicación publicada',geometry:null,value:null,unit:'m',delta24h:null,trend:'UNKNOWN',observedAt:iso(now-7200000),fetchedAt:iso(now-30000),freshness:'FRESH',verificationState:'PUBLISHED_OPERATIONAL',ageMinutes:120}
];
const viewports=[[320,568],[390,844],[768,1024],[1024,768],[1440,900]];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||chromium.executablePath()});
const results=[];
try{
 for(const [width,height] of viewports){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.addInitScript(()=>{if(location.origin==='http://127.0.0.1:8790')localStorage.setItem('sos-zones',JSON.stringify([{name:'Santa Fe QA',province:'Santa Fe',lat:-31.6333,lon:-60.7,radiusKm:25},{name:'Rosario QA',province:'Santa Fe',lat:-32.95,lon:-60.66,radiusKm:25}]));window.__geoCalls=0;window.__permissionCalls=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success){window.__geoCalls++;success({coords:{latitude:-31.6333,longitude:-60.7,accuracy:50}})}}});class N{};N.requestPermission=async()=>{window.__permissionCalls++;return'denied'};Object.defineProperty(window,'Notification',{configurable:true,value:N})});
  const page=await context.newPage();
  await page.route('**/api/**',async r=>{
   const u=new URL(r.request().url());let body={ok:true,data:{}};
   if(u.pathname==='/api/overview')body=overview;
   else if(u.pathname==='/api/events/batch'){const zones=r.request().postDataJSON()?.zones||[];body={ok:true,data:{zones:zones.map(z=>({id:z.id,events:[event],count:1,verification})),verification,dataPlane:'FIXTURE'}};}
   else if(u.pathname==='/api/events')body=eventList;
   else if(u.pathname==='/api/observations')body={ok:true,data:{observations,count:observations.length,sourceState:{providerId:'ina',state:'AVAILABLE',freshness:'FRESH',providers:{ina:{state:'AVAILABLE',count:2},prefectura:{state:'UNAVAILABLE',count:0}}}}};
   else if(u.pathname==='/api/sources')body={ok:true,data:{capabilityRegistry:[{providerId:'ina',organization:'Instituto Nacional del Agua',sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',status:'PUBLISHED',coverage:'Argentina',limitations:['No reemplaza alertas oficiales.'],publicHumanUrl:'https://alerta.ina.gob.ar/'}],providerVerification:{}}};
   else if(u.pathname==='/api/georef/search')body={ok:true,data:{results:[{id:'qa-santa-fe',name:'Santa Fe',province:'Santa Fe',lat:-31.6333,lon:-60.7}]}};
   else if(u.pathname==='/api/coverage')body={ok:true,data:{capabilities:[]}};
   else if(u.pathname==='/api/risk-layers')body={ok:true,data:{layers:[]}};
   else if(u.pathname==='/api/push/config')body={ok:true,data:{enabled:false,publicKey:null,defaults:{officialWarnings:true,modelSignals:false,satelliteEstimates:false}}};
   await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const errors=[],weatherRequests=[],apiRequests=[],baseMapRequests=[],riskMapRequests=[],gibsMetadataRequests=[],gibsWmsRequests=[],httpFailures=[],sourcePayloadBytes=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/'))apiRequests.push({path:u.pathname+u.search,method:r.method(),body:r.postData()});if(u.hostname==='ows.terrestris.de'&&u.searchParams.get('layers')==='OSM-WMS')baseMapRequests.push(r.url());if(u.hostname==='wms.ign.gob.ar')riskMapRequests.push(r.url());if(u.hostname==='gibs.earthdata.nasa.gov'&&u.pathname.includes('/wmts/'))gibsMetadataRequests.push(r.url());if(u.hostname==='gibs.earthdata.nasa.gov'&&u.pathname.includes('/wms/'))gibsWmsRequests.push(r.url());if(r.url().includes('api.open-meteo.com'))weatherRequests.push(r.url())});page.on('response',r=>{if(r.status()>=400)httpFailures.push({url:r.url(),status:r.status()})});const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');await page.route('https://ows.terrestris.de/**',r=>r.fulfill({status:200,contentType:'image/png',body:png}));await page.route('https://wms.ign.gob.ar/**',r=>r.fulfill({status:200,contentType:'image/png',body:png}));await page.route('https://gibs.earthdata.nasa.gov/wmts/**',r=>r.fulfill({status:200,contentType:'application/xml',body:'<Capabilities><DimensionDomain><Domain>'+iso(now-60000)+'</Domain></DimensionDomain></Capabilities>'}));await page.route('https://gibs.earthdata.nasa.gov/wms/**',r=>r.fulfill({status:200,contentType:'image/png',body:png}));
  await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('#event-list .event-row',{timeout:15000});
  
  try{await page.waitForFunction(()=>document.querySelector('#nearby-evidence')?.textContent.includes('ESTACIONES REGIONALES'),null,{timeout:10000})}catch(e){console.error('INITIAL_NEARBY_DEBUG',JSON.stringify({errors,apiRequests,nearby:await page.locator('#nearby-evidence').textContent().catch(()=>''),observationState:await page.evaluate(()=>({count:document.querySelectorAll('.river-card').length,text:document.querySelector('#nearby-evidence')?.innerText,source:window.__observationSourceState||null}))}));throw e}
  assert.equal(await page.title(),'APHORA · Situación del territorio');
  assert.equal(await page.locator('#territory-title').textContent(),'Situación del territorio');
  assert.equal(await page.locator('#weather-hero').count(),0,'weather-first hero must not be injected');
  assert.ok((await page.locator('#national-counts').textContent()).includes('sismos (7 días)'));
  assert.match(await page.locator('#overview-generated').textContent(),/^SMN /);
  assert.match(await page.locator('#nearby-evidence').textContent(),/RÍOS A MENOS DE 100 KM/);
  assert.match(await page.locator('#nearby-evidence').textContent(),/ESTACIONES REGIONALES/);
  assert.equal(await page.evaluate(()=>window.__geoCalls),0,'location must not be requested on load');
  assert.equal(await page.evaluate(()=>window.__permissionCalls),0,'push permission must not be requested on load');
  const palette=await page.evaluate(()=>({root:getComputedStyle(document.documentElement).backgroundColor,brand:getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),intro:getComputedStyle(document.querySelector('.territory-intro')).backgroundColor,scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth}));
  assert.equal(palette.brand,'#173e63','civic-blue brand palette at '+width+'px');
  assert.deepEqual(weatherRequests,[],'no weather-provider calls on the territory overview');
  assert.ok(palette.scrollWidth<=palette.innerWidth+1,'horizontal overflow at '+width+'px: '+JSON.stringify(palette));
  assert.deepEqual(errors,[],'browser errors at '+width+'px');
  const axe=await new AxeBuilder({page}).analyze();
  const serious=axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical');
  assert.equal(serious.length,0,'serious accessibility violations at '+width+'px: '+serious.map(v=>v.id).join(','));
  if(width===390||width===1440)await page.screenshot({path:OUT+'/aphora-'+width+'.png',fullPage:true});
  results.push({viewport:width+'x'+height,title:await page.title(),nationalCounts:await page.locator('#national-counts').textContent(),regionalStations:(await page.locator('#nearby-evidence').textContent()).includes('ESTACIONES REGIONALES'),weatherHeroCount:await page.locator('#weather-hero').count(),weatherRequests:weatherRequests.length,palette,seriousAccessibilityViolations:serious.length,pass:true});

  if(width===390||width===1440){
  results[results.length-1].initialAssets=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/app\.js|app\.css|map-view\.js|zones-view\.js/.test(r.name)).map(r=>({name:new URL(r.name).pathname,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize})));
  assert.equal(apiRequests.filter(x=>x.path==='/api/overview').length,1,'one initial overview request');
  assert.equal(apiRequests.filter(x=>x.path.startsWith('/api/events?')).length,1,'one initial event request');
  assert.equal(apiRequests.filter(x=>x.path.startsWith('/api/observations?')).length,1,'one initial observation request');
  assert.equal(apiRequests.filter(x=>x.path.startsWith('/api/sources')).length,0,'source catalog is lazy, not fetched on initial overview');
  if(width>=900){await page.waitForFunction(()=>performance.getEntriesByType('resource').some(r=>new URL(r.name).pathname==='/map-view.js'));await page.waitForFunction(()=>document.querySelector('#argenmap')?.getAttribute('src'));}
  const initialChunkPaths=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>new URL(r.name).pathname));
  if(width>=900){assert.ok(initialChunkPaths.includes('/map-view.js'),'desktop home loads its visible map chunk');assert.ok(!initialChunkPaths.includes('/zones-view.js'),'zones chunk remains lazy on desktop');}
  else assert.ok(!initialChunkPaths.includes('/map-view.js')&&!initialChunkPaths.includes('/zones-view.js'),'map and zones chunks remain lazy on mobile home');
  const initialBaseMapCount=baseMapRequests.length;
  assert.equal(initialBaseMapCount,width>=900?1:0,'base map only loads on desktop home or after mobile Map navigation');
  async function clickView(view){if(width>=900){const action=({now:'home',map:'map',zones:'preparation',sources:'sources'})[view];await page.locator('.desktop-sidebar [data-sidebar-action="'+action+'"]').click()}else await page.locator('.bottom-nav button[data-view="'+view+'"]').click()}
  async function noOverflow(stage){const p=await page.evaluate(()=>({innerWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(p.scrollWidth<=p.innerWidth+1,stage+' horizontal overflow: '+JSON.stringify(p))}
  async function noSeriousA11y(stage){const a=await new AxeBuilder({page}).analyze(),v=a.violations.filter(x=>x.impact==='serious'||x.impact==='critical');assert.equal(v.length,0,stage+' serious accessibility issues: '+v.map(x=>x.id).join(','))}
  await clickView('map');
  await page.waitForFunction(()=>!document.querySelector('#map-view').hidden&&document.querySelector('#argenmap').getAttribute('src'));
  await page.waitForFunction(()=>document.querySelector('#argenmap').complete&&document.querySelector('#argenmap').naturalWidth>0);
  assert.ok(baseMapRequests.length>=1&&baseMapRequests.length<=initialBaseMapCount+1,'base map is fetched only when the rendered map size changes');
  assert.ok(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('map-view.js'))),'map chunk loaded on demand');
  await page.locator('[data-map-role="OFFICIAL_WARNING"]').click();
  assert.equal(baseMapRequests.length,1,'map role filter does not reload the base map');
  const riskOptions=await page.locator('#risk-layer-select option').evaluateAll(os=>os.map(o=>o.value).filter(Boolean));
  assert.ok(riskOptions.length>0,'at least one risk layer is available');
  for(const risk of riskOptions){const response=page.waitForResponse(r=>new URL(r.url()).hostname==='wms.ign.gob.ar'&&new URL(r.url()).searchParams.get('layers')!=='capabaseargenmap');await page.locator('#risk-layer-select').selectOption(risk);await response;await page.waitForFunction(()=>document.querySelector('#risk-overlay').complete&&document.querySelector('#risk-overlay').naturalWidth>0)}
  assert.equal(riskMapRequests.length,riskOptions.length,'each selectable risk layer loads exactly once');
  const gibsOptions=await page.locator('#gibs-layer-select option').evaluateAll(os=>os.map(o=>o.value).filter(Boolean));
  assert.ok(gibsOptions.includes('trueColor')&&gibsOptions.length>=1,'NASA layer selector exposes its documented products');
  for(const layer of gibsOptions){const response=page.waitForResponse(r=>new URL(r.url()).hostname==='gibs.earthdata.nasa.gov'&&new URL(r.url()).pathname.includes('/wms/'));await page.locator('#gibs-layer-select').selectOption(layer);await response;await page.waitForFunction(()=>document.querySelector('#gibs-overlay').complete&&document.querySelector('#gibs-overlay').naturalWidth>0)}
  assert.equal(gibsMetadataRequests.length,gibsOptions.length,'each NASA layer requests metadata once');
  assert.equal(gibsWmsRequests.length,gibsOptions.length,'each NASA layer loads one overlay before map movement');
  const bgBefore=baseMapRequests.length,riskBefore=riskMapRequests.length,gibsBefore=gibsWmsRequests.length;
  for(const role of ['OFFICIAL_WARNING','OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION','supplementary',''])await page.locator('[data-map-role="'+role+'"]').click();
  assert.equal(baseMapRequests.length,bgBefore,'role filters do not reload unchanged base map');
  assert.equal(riskMapRequests.length,riskBefore,'role filters do not reload unchanged risk overlay');
  assert.equal(gibsWmsRequests.length,gibsBefore,'role filters do not reload unchanged satellite overlay');
  await noOverflow('map');
  await noSeriousA11y('map');
  for(const selector of ['[data-pan="w"]','[data-pan="n"]','[data-pan="s"]','[data-pan="e"]','#zoom-in','#zoom-out']){
    await page.locator(selector).click();
    await page.waitForFunction(()=>document.querySelector('#argenmap').complete&&document.querySelector('#argenmap').naturalWidth>0);
  }
  assert.equal(gibsMetadataRequests.length,gibsOptions.length,'map pan/zoom reuses metadata for each selected NASA product');
  const firstSourceResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/sources');
  await clickView('sources');
  const firstSourcePayload=await firstSourceResponse;sourcePayloadBytes.push((await firstSourcePayload.body()).length);
  await page.waitForSelector('#source-list .source-row');
  assert.equal(apiRequests.filter(x=>x.path.startsWith('/api/sources')).length,1,'source catalog fetched once on demand');
  assert.ok(apiRequests.some(x=>x.path==='/api/sources?view=capabilities'),'compact source catalog route used');
  const sourceLink=page.locator('#source-list .source-row a').first();assert.equal(await sourceLink.getAttribute('href'),'https://alerta.ina.gob.ar/');assert.ok((await sourceLink.getAttribute('rel')).includes('noopener'));
  await noOverflow('sources');
  await noSeriousA11y('sources');
  await clickView('now');
  await clickView('sources');
  assert.equal(apiRequests.filter(x=>x.path.startsWith('/api/sources')).length,1,'source catalog reused from in-memory cache');
  const refreshSourceResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/sources');
  await page.locator('#refresh').click();
  const refreshPayload=await refreshSourceResponse;sourcePayloadBytes.push((await refreshPayload.body()).length);
  assert.equal(apiRequests.filter(x=>x.path.startsWith('/api/sources')).length,2,'explicit refresh reloads compact source status once');
  const bboxCallsBeforeZones=apiRequests.filter(x=>x.path.startsWith('/api/events?')).length;
  const initialZoneBatch=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/events/batch');
  await clickView('zones');
  await initialZoneBatch;
  await page.waitForFunction(()=>document.querySelectorAll('#zone-list .zone-card').length===2);
  await page.waitForFunction(()=>[...document.querySelectorAll('.zone-state')].every(e=>!e.textContent.includes('Consultando')));
  assert.ok(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('zones-view.js'))),'zones chunk loaded on demand');
  assert.equal(apiRequests.filter(x=>x.path==='/api/events/batch').length,1,'two saved zones use one batch request');
  assert.equal(apiRequests.filter(x=>x.path.startsWith('/api/events?')).length,bboxCallsBeforeZones,'zone cards do not issue one /api/events request each');
  await noOverflow('zones');
  await noSeriousA11y('zones');
  await page.locator('#push-optin').click();
  await page.waitForFunction(()=>document.querySelector('#push-state').textContent.includes('configuración segura'));
  assert.equal(await page.evaluate(()=>window.__permissionCalls),0,'disabled push configuration never prompts for browser permission');
  await page.locator('#push-test').click();
  await page.locator('#push-delete').click();
  const saveBatch=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/events/batch');
  await page.locator('#zone-name').fill('QA saved zone');
  await page.locator('#save-zone').click();
  await saveBatch;
  await page.waitForFunction(()=>document.querySelectorAll('#zone-list .zone-card').length===3);
  assert.equal(apiRequests.filter(x=>x.path==='/api/events/batch').length,2,'saving a zone refreshes all zone statuses in one batch');
  const removeBatch=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/events/batch');
  await page.locator('[data-z="0"]').click();
  await removeBatch;
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('sos-zones')||'[]').length===2);
  await page.waitForFunction(()=>document.querySelectorAll('#zone-list .zone-card').length===2);
  assert.equal(apiRequests.filter(x=>x.path==='/api/events/batch').length,3,'removing a zone refreshes remaining zones with one batch');
  await page.locator('[data-z-open="0"]').click();
  await page.waitForFunction(()=>document.querySelector('.bottom-nav button[data-view="now"]').getAttribute('aria-current')==='page');
  await page.waitForSelector('#event-list .event-row');
  const detailButton=page.locator('#event-list .event-row button').first();
  assert.ok(await detailButton.count()>0,'event detail action is present');await detailButton.click();await page.waitForFunction(()=>document.querySelector('#event-detail').open);await page.locator('#event-detail .dialog-close').click()
  await page.locator('#manual-location').click();
  await page.locator('#place').fill('Santa Fe');
  await page.locator('#search').click();
  await page.waitForSelector('#search-results button');
  await page.locator('#search-results button').first().click();
  await page.waitForFunction(()=>document.querySelector('#selected-location').textContent.includes('Santa Fe'));
  assert.equal(apiRequests.filter(x=>x.path.startsWith('/api/georef/search?')).length,1,'manual place search uses one GeoRef request');
  await page.locator('#verification-details').click();
  await page.waitForFunction(()=>document.querySelector('#verification-dialog').open);
  await page.locator('#verification-dialog .dialog-close').click();
  await page.locator('#manual-location').click();await page.locator('#use-location').click();await page.waitForFunction(()=>window.__geoCalls===1);await page.waitForFunction(()=>document.querySelector('#selected-location').textContent.includes('Mi ubicación'));
  for(const selector of ['#hazard-filter','#verification-filter','#role-filter','#state-filter']){
    const opts=await page.locator(selector+' option').evaluateAll(os=>os.map(o=>o.value));
    const chosen=opts.find(v=>v!=='');
    if(chosen)await page.locator(selector).selectOption(chosen);
    await page.locator(selector).selectOption('').catch(()=>{});
  }
  await noOverflow('after all controls');
  let sidebarActionsTested=0,dashboardCardsTested=0;
  if(width>=900){
   const navChecks=[['home','now',null],['alerts','now','#events'],['rivers','now','#nearby-observations'],['earthquakes','now','#events'],['phenomena','now','#hazard-overview'],['preparation','zones','#preparedness-panel'],['resources','zones','#resources-panel'],['sources','sources','#source-list'],['map','map','#map-view']];
   for(const [action,view,target] of navChecks){await page.locator('.desktop-sidebar [data-sidebar-action="'+action+'"]').click();await page.waitForFunction(v=>document.querySelector('#main').dataset.view===v,view);if(target)assert.ok(await page.locator(target).isVisible(),action+' navigation target is visible');sidebarActionsTested++;}
   const resourceLinks=page.locator('#resources-panel .resource-links a');assert.equal(await resourceLinks.count(),5,'resources view exposes five external references');for(let i=0;i<await resourceLinks.count();i++){const link=resourceLinks.nth(i);assert.ok((await link.getAttribute('href')).startsWith('https://'),'resource link uses HTTPS');assert.ok((await link.getAttribute('rel')).includes('noopener'),'external resource link isolates opener');}
    await noOverflow('desktop sidebar navigation');
  }
  if(width===390){
   for(const action of ['rivers','alerts','earthquakes','events']){await page.locator('[data-dashboard-action="'+action+'"]').click();await page.waitForFunction(()=>document.querySelector('#main').dataset.view==='now');dashboardCardsTested++;}
   await noOverflow('mobile dashboard cards');
  }
  assert.deepEqual(weatherRequests,[],'no weather-provider calls after all interactions');
  assert.deepEqual(errors,[],'no browser console/page errors after interactions');
  assert.deepEqual(httpFailures,[],'no failed assets or requests after interactions');
  results[results.length-1].lazyAssets=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/map-view\.js|zones-view\.js/.test(r.name)).map(r=>({name:new URL(r.name).pathname,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize})));results[results.length-1].interactionTests={baseMapRequests:baseMapRequests.length,riskMapRequests:riskMapRequests.length,gibsMetadataRequests:gibsMetadataRequests.length,gibsOverlayRequests:gibsWmsRequests.length,compactSourceRequests:apiRequests.filter(x=>x.path.startsWith('/api/sources')).length,compactSourcePayloadBytes:sourcePayloadBytes,zoneBatchRequests:apiRequests.filter(x=>x.path==='/api/events/batch').length,georefRequests:apiRequests.filter(x=>x.path.startsWith('/api/georef/search?')).length,permissionRequests:await page.evaluate(()=>window.__permissionCalls),geolocationRequests:await page.evaluate(()=>window.__geoCalls),sidebarActionsTested,dashboardCardsTested,noOverflow:true,noSeriousA11y:true,pass:true};
  }

  await context.close();
 }
}finally{await browser.close()}
const report={generatedAt:new Date().toISOString(),artifact:'dist/public',results};
fs.writeFileSync(OUT+'/report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
