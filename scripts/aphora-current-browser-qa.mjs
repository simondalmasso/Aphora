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
 {observationId:'obs:regional',observationType:'RIVER_LEVEL',hazardType:'FLOOD',providerId:'ina',sourceOrganization:'Instituto Nacional del Agua',sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',label:'Río regional',locationLabel:'Estación regional de prueba',geometry:{type:'Point',coordinates:[-60.7,-31.63]},value:3.1,unit:'m',delta24h:null,trend:'UNKNOWN',observedAt:iso(now-3600000),fetchedAt:iso(now-30000),freshness:'FRESH',verificationState:'PUBLISHED_OPERATIONAL',ageMinutes:60}
];
const viewports=[[320,568],[390,844],[768,1024],[1440,900]];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||chromium.executablePath()});
const results=[];
try{
 for(const [width,height] of viewports){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.addInitScript(()=>{window.__geoCalls=0;window.__permissionCalls=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(){window.__geoCalls++}}});class N{};N.requestPermission=async()=>{window.__permissionCalls++;return'denied'};Object.defineProperty(window,'Notification',{configurable:true,value:N})});
  const page=await context.newPage();
  await page.route('**/api/**',async r=>{
   const u=new URL(r.request().url());let body={ok:true,data:{}};
   if(u.pathname==='/api/overview')body=overview;
   else if(u.pathname==='/api/events')body=eventList;
   else if(u.pathname==='/api/observations')body={ok:true,data:{observations,count:observations.length,sourceState:{providerId:'ina',state:'AVAILABLE',freshness:'FRESH',providers:{ina:{state:'AVAILABLE',count:2},prefectura:{state:'UNAVAILABLE',count:0}}}}};
   else if(u.pathname==='/api/sources')body={ok:true,data:{capabilityRegistry:[],providerVerification:{}}};
   else if(u.pathname==='/api/georef/search')body={ok:true,data:{results:[{id:'qa-santa-fe',name:'Santa Fe',province:'Santa Fe',lat:-31.6333,lon:-60.7}]}};
   else if(u.pathname==='/api/coverage')body={ok:true,data:{capabilities:[]}};
   else if(u.pathname==='/api/risk-layers')body={ok:true,data:{layers:[]}};
   else if(u.pathname==='/api/push/config')body={ok:true,data:{enabled:false,publicKey:null,defaults:{officialWarnings:true,modelSignals:false,satelliteEstimates:false}}};
   await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const errors=[],weatherRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('api.open-meteo.com'))weatherRequests.push(r.url())});
  await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('#event-list .event-row',{timeout:15000});
  
  await page.waitForFunction(()=>document.querySelector('#nearby-evidence')?.textContent.includes('ESTACIONES REGIONALES'),null,{timeout:10000});
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
  await context.close();
 }
}finally{await browser.close()}
const report={generatedAt:new Date().toISOString(),artifact:'dist/public',results};
fs.writeFileSync(OUT+'/report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
