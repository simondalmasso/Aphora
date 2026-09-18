const http=require('http');
const fs=require('fs');
const path=require('path');
const zlib=require('zlib');
const {chromium}=require('C:/ProgramData/SentinelX/workspace/v3hf2/recovered-hf2/source/node_modules/playwright');
const AxeMod=require('C:/ProgramData/SentinelX/workspace/v3hf2/recovered-hf2/source/node_modules/@axe-core/playwright');
const AxeBuilder=AxeMod.default||AxeMod;

const ROOT=path.resolve(process.env.APHORA_QA_ROOT||'public');
const OUT=path.resolve(process.env.APHORA_QA_OUT||'evidence/super-r1');
const REPORT_NAME=process.env.APHORA_QA_REPORT||'browser-qa.json';
const PORT=Number(process.env.APHORA_QA_PORT||41755);
const BASE='http://127.0.0.1:'+PORT;
fs.mkdirSync(OUT,{recursive:true});
const shotDir=path.join(OUT,'screens');
fs.mkdirSync(shotDir,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};

const server=http.createServer((req,res)=>{
  const u=new URL(req.url,BASE);
  let rel=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1));
  const f=path.resolve(ROOT,rel);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end('not found');return}
  res.setHeader('content-type',mime[path.extname(f).toLowerCase()]||'application/octet-stream');
  res.setHeader('cache-control','no-store');
  res.end(fs.readFileSync(f));
});

const now=Date.now();
const isoMin=m=>new Date(now-m*60000).toISOString();
const futureH=h=>new Date(now+h*3600000).toISOString();
const srcWarning=(id='smn-cap')=>({providerId:id,sourceRole:'OFFICIAL_WARNING',sourceOrganization:'Servicio Meteorológico Nacional',official:true,verificationState:'VERIFIED_MACHINE',freshness:'FRESH',capSeverity:'Moderate',issuedAt:isoMin(45),fetchedAt:isoMin(2),expiresAt:futureH(4),sourceUrl:'https://www.smn.gob.ar/'});
const windA={eventId:'event:smn:wind-a',hazardType:'WIND',lifecycle:'ACTIVE',recordIds:['smn:a'],geometry:{type:'Point',coordinates:[-60.705,-31.637]},bbox:[-60.76,-31.70,-60.65,-31.59],provinces:['Santa Fe'],regions:['Santa Fe Capital'],officialWarningState:'ACTIVE',observationState:'NONE',modelState:'NONE',impactState:'NONE',verificationState:'VERIFIED_MACHINE',freshness:'FRESH',firstSeenAt:isoMin(80),lastChangedAt:isoMin(15),expiresAt:futureH(4),displaySeverity:'Moderate',capSeverity:'Moderate',dominantHeadline:'Viento fuerte en Santa Fe',plainLanguageSummary:'Alerta oficial por viento fuerte.',recommendedActions:[],sourceCount:1,sources:[srcWarning()]};
const windB={...windA,eventId:'event:smn:wind-b',recordIds:['smn:b'],geometry:{type:'Point',coordinates:[-60.73,-31.62]},bbox:[-60.78,-31.68,-60.68,-31.57],firstSeenAt:isoMin(70),lastChangedAt:isoMin(12),dominantHeadline:'Viento  fuerte en Santa Fe'};
const quake={eventId:'event:inpres:q1',hazardType:'EARTHQUAKE',lifecycle:'ACTIVE',recordIds:['inpres:q1'],geometry:{type:'Point',coordinates:[-60.78,-31.67]},bbox:[-60.78,-31.67,-60.78,-31.67],provinces:['Santa Fe'],regions:['Santa Fe Capital'],officialWarningState:'NONE_VERIFIED',observationState:'PRESENT',modelState:'NONE',impactState:'NONE',verificationState:'VERIFIED_MACHINE',freshness:'FRESH',firstSeenAt:isoMin(28),lastChangedAt:isoMin(28),expiresAt:null,displaySeverity:null,dominantHeadline:'Sismo observado',plainLanguageSummary:'Observación sísmica oficial.',recommendedActions:[],sourceCount:1,sources:[{providerId:'inpres',sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',sourceOrganization:'INPRES',official:true,verificationState:'VERIFIED_MACHINE',freshness:'FRESH',observedAt:isoMin(28),fetchedAt:isoMin(27),sourceUrl:'https://www.inpres.gob.ar/'}]};
const observations=[
 {observationId:'ina:river:30',observationType:'RIVER_LEVEL',hazardType:'FLOOD',providerId:'ina',sourceOrganization:'Instituto Nacional del Agua',sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',label:'Río Paraná',locationLabel:'Santa Fe',geometry:{type:'Point',coordinates:[-60.684,-31.659]},lon:-60.684,lat:-31.659,geometryPrecision:'PROVIDER_PUBLISHED_UNVALIDATED',coordinateSource:'INA_SIYAH_SERIES_GEOJSON',observedAt:isoMin(20),fetchedAt:isoMin(5),freshness:'FRESH',verificationState:'PUBLISHED_OPERATIONAL',value:2.65,unit:'m',delta24h:-0.05,trend:'FALLING',stationId:'30',seriesId:'30',sourceUrl:'https://alerta.ina.gob.ar/'},
 {observationId:'ina:river:3044',observationType:'RIVER_LEVEL',hazardType:'FLOOD',providerId:'ina',sourceOrganization:'Instituto Nacional del Agua',sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',label:'Río Salado',locationLabel:'Santo Tomé',geometry:{type:'Point',coordinates:[-60.773,-31.667]},lon:-60.773,lat:-31.667,geometryPrecision:'PROVIDER_PUBLISHED_UNVALIDATED',coordinateSource:'INA_SIYAH_SERIES_GEOJSON',observedAt:isoMin(35),fetchedAt:isoMin(5),freshness:'FRESH',verificationState:'PUBLISHED_OPERATIONAL',value:3.42,unit:'m',delta24h:0.08,trend:'RISING',stationId:'1679',seriesId:'3044',sourceUrl:'https://alerta.ina.gob.ar/'}
];
const registry=[
 {providerId:'smn-cap',organization:'Servicio Meteorológico Nacional',sourceRole:'OFFICIAL_WARNING',status:'ACTIVE',coverage:'ARGENTINA',limitations:[],publicHumanUrl:'https://www.smn.gob.ar/'},
 {providerId:'ina',organization:'Instituto Nacional del Agua',sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',status:'ACTIVE',coverage:'DOCUMENTED_STATIONS_ONLY',limitations:['Medición hidrométrica no equivale a alerta'],publicHumanUrl:'https://alerta.ina.gob.ar/'},
 {providerId:'inpres',organization:'INPRES',sourceRole:'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',status:'ACTIVE',coverage:'ARGENTINA',limitations:[],publicHumanUrl:'https://www.inpres.gob.ar/'}
];

function payload(mode='ACTIVE'){
 const smnDegraded=mode==='SMN_DEGRADED';
 const inaPartial=mode==='INA_PARTIAL';
 const empty=mode==='VERIFIED_EMPTY';
 const unknown=mode==='RIVER_UNKNOWN';
 const eventList=empty?[]:[windA,windB,quake];
 const v=smnDegraded?{officialWarningFeed:'DEGRADED_CANNOT_VERIFY',activeCount:null,canSayNoActiveOfficialWarnings:false,verifiedAt:isoMin(40),errorClass:'UPSTREAM_UNAVAILABLE'}:
   empty?{officialWarningFeed:'FRESH_NO_ACTIVE_WARNINGS',activeCount:0,canSayNoActiveOfficialWarnings:true,verifiedAt:isoMin(2)}:
   {officialWarningFeed:'ACTIVE_WARNINGS_VERIFIED',activeCount:2,canSayNoActiveOfficialWarnings:false,verifiedAt:isoMin(2)};
 const obs=unknown?observations.map((o,i)=>i?o:{...o,value:null,delta24h:null,freshness:'STALE'}):observations;
 const obsState={providerId:'ina',state:inaPartial?'PARTIAL':'AVAILABLE',measurementState:'AVAILABLE',coordinateState:inaPartial?'UNAVAILABLE':'AVAILABLE',freshness:obs.some(o=>o.freshness==='FRESH')?'FRESH':'STALE',verification:'SOURCE_SCOPED'};
 const pv={
   'smn-cap':{state:smnDegraded?'DEGRADED_UPSTREAM':'FRESH_PARSED',verifiedAt:smnDegraded?isoMin(40):isoMin(2)},
   ina:{state:inaPartial?'DEGRADED_PARTIAL':'FRESH_OBSERVATIONS',verifiedAt:isoMin(5)},
   inpres:{state:'FRESH_PARSED',verifiedAt:isoMin(27)}
 };
 return {
  verification:v,eventList,obs,obsState,pv,
  overview:{ok:true,data:{generatedAt:isoMin(1),verification:v,nationalEventCount:eventList.length,nationalActiveOfficialWarnings:v.activeCount,recentEarthquakeCount:empty?0:1,recentEarthquakes:empty?0:1,activeZoneCount:0,countsByHazard:{WIND:empty?0:2,EARTHQUAKE:empty?0:1,FLOOD:0,STORM:0,WILDFIRE:0,UNKNOWN:null},countsByProvince:{'Santa Fe':eventList.length},situationEvents:eventList,providerVerification:pv}},
  events:{ok:true,data:{events:eventList,count:eventList.length,limit:50,offset:0,verification:v},meta:{offline:false}},
  observations:{ok:true,data:{observations:obs,count:obs.length,limit:50,sourceState:obsState,coverage:{scope:'DOCUMENTED_STATIONS_ONLY',nationalCoverageClaim:false,adminBoundaryFilter:false,metadataSource:'INA_SIYAH_SERIES_GEOJSON',coordinatePrecision:'PROVIDER_PUBLISHED_UNVALIDATED'}}},
  sources:{ok:true,data:{capabilityRegistry:registry,providerVerification:pv}},
  coverage:{ok:true,data:{capabilities:registry}},
  snapshot:{ok:true,data:{generatedAt:isoMin(1),systems:[]},meta:{offline:false}}
 };
}
async function routeApis(page,mode){
 const d=payload(mode);
 await page.route('**/api/**',async route=>{
   const u=new URL(route.request().url()),p=u.pathname;
   let body,status=200;
   if(p==='/api/overview')body=d.overview;
   else if(p==='/api/events')body=d.events;
   else if(p.startsWith('/api/events/')){const id=decodeURIComponent(p.slice('/api/events/'.length)),e=d.eventList.find(x=>x.eventId===id);body=e?{ok:true,data:e}:{ok:false,error:{code:'NOT_FOUND'}};status=e?200:404}
   else if(p==='/api/observations')body=d.observations;
   else if(p==='/api/sources')body=d.sources;
   else if(p==='/api/coverage')body=d.coverage;
   else if(p==='/api/snapshot')body=d.snapshot;
   else if(p==='/api/georef/search')body={ok:true,data:{results:[{name:'Santa Fe',province:'Santa Fe',lat:-31.6333,lon:-60.7000}]}};
   else if(p==='/api/push/config')body={ok:true,data:{enabled:true,publicKey:'AAAA',defaults:{officialWarnings:true,modelSignals:false,satelliteEstimates:false}}};
   else body={ok:true,data:{}};
   await route.fulfill({status,contentType:'application/json; charset=utf-8',body:JSON.stringify(body)});
 });
}

const report={generatedAt:new Date().toISOString(),root:ROOT,santaFeAcceptance:'PENDING',axe:{serious:0,critical:0,details:[]},visualMatrix:{states:0,viewports:{}},performancePrivacySecurity:'PENDING',reducedMotion:'PENDING',consoleErrors:[],pageErrors:[],assertions:[]};
const assert=(cond,name,detail='')=>{report.assertions.push({name,pass:Boolean(cond),detail});if(!cond)throw new Error(name+(detail?': '+detail:''))};
(async()=>{
 await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'});
 try{
   const viewports=[[320,568],[390,844],[412,914],[768,1024],[1440,900]];
   const states=['ACTIVE','INA_PARTIAL','SMN_DEGRADED','VERIFIED_EMPTY','RIVER_UNKNOWN'];
   for(const [w,h] of viewports){
     report.visualMatrix.viewports[w+'x'+h]={};
     for(const state of states){
       const context=await browser.newContext({viewport:{width:w,height:h},serviceWorkers:'block'});
       await context.addInitScript(()=>{
         window.__geoCalls=0;window.__notificationCalls=0;
         Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(_ok,err){window.__geoCalls++;err&&setTimeout(()=>err({code:1,message:'denied'}),0)}}});
         class N{};N.requestPermission=async()=>{window.__notificationCalls++;return'denied'};Object.defineProperty(window,'Notification',{configurable:true,value:N});
         Object.defineProperty(window,'PushManager',{configurable:true,value:function PushManager(){}});
       });
       const page=await context.newPage();
       const requests=[],consoleErrors=[],pageErrors=[];
       page.on('request',r=>requests.push(r.url()));
       page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|ERR_FAILED|ERR_ABORTED/i.test(m.text()))consoleErrors.push(m.text())});
       page.on('pageerror',e=>pageErrors.push(e.message));
       await routeApis(page,state);
       await page.route('https://**/*',r=>r.abort());
       const started=Date.now();
       await page.goto(BASE+'/',{waitUntil:'networkidle',timeout:30000});
       const elapsedMs=Date.now()-started;
       await page.waitForSelector('#nearby-observations',{timeout:5000});
       const dims=await page.evaluate(()=>({innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,geo:window.__geoCalls,notification:window.__notificationCalls}));
       const overflowEls=await page.evaluate(()=>[...document.querySelectorAll('body *')].map(e=>{const r=e.getBoundingClientRect();return{tag:e.tagName,id:e.id,cls:e.className?.baseVal||e.className||'',left:r.left,right:r.right,width:r.width,scrollWidth:e.scrollWidth}}).filter(x=>x.right>innerWidth+1||x.left< -1||x.scrollWidth>x.width+1).sort((a,b)=>b.right-a.right).slice(0,15));
       assert(dims.doc<=dims.innerWidth+1&&dims.body<=dims.innerWidth+1,'NO_HORIZONTAL_OVERFLOW_'+w+'_'+state,JSON.stringify({dims,overflowEls}));
       assert(dims.geo===0,'ZERO_INITIAL_GPS_'+w+'_'+state,String(dims.geo));
       assert(dims.notification===0,'ZERO_INITIAL_NOTIFICATION_'+w+'_'+state,String(dims.notification));
       const externalInitial=requests.filter(u=>!u.startsWith(BASE+'/'));
       assert(externalInitial.length===0,'ZERO_INITIAL_EXTERNAL_REQUESTS_'+w+'_'+state,externalInitial.join(','));
       assert(consoleErrors.length===0,'NO_CONSOLE_ERRORS_'+w+'_'+state,JSON.stringify(consoleErrors));
       assert(pageErrors.length===0,'NO_PAGE_ERRORS_'+w+'_'+state,JSON.stringify(pageErrors));
       assert(await page.locator('#nearby-observations').isVisible(),'HYDROLOGY_FIRST_CLASS_'+w+'_'+state);
       if(state!=='VERIFIED_EMPTY'){
         assert(await page.locator('.river-card').count()===2,'RIVER_CARDS_TWO_'+w+'_'+state,String(await page.locator('.river-card').count()));
         assert((await page.locator('.river-card').first().innerText()).includes('NO ES UNA ALERTA DE INUNDACIÓN'),'RIVER_ROLE_TRUTH_'+w+'_'+state);
         assert(await page.locator('#situation-events [data-situation-observation-id]').count()===2,'SITUATION_RIVER_MARKERS_'+w+'_'+state,String(await page.locator('#situation-events [data-situation-observation-id]').count()));
       }
       if(state==='ACTIVE'){
         assert(await page.locator('.event-cluster').count()>=1,'PRESENTATION_CLUSTER_VISIBLE_'+w);
         const clusterText=await page.locator('.event-cluster').first().innerText();
         assert(clusterText.includes('2 alertas conservadas por separado'),'CLUSTER_PRESERVES_COUNT_'+w,clusterText);
         const axe=await new AxeBuilder({page}).analyze();
         const severe=axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical');
         for(const v of severe){report.axe[v.impact]++;report.axe.details.push({viewport:w+'x'+h,id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)})}
       }
       if(state==='INA_PARTIAL'){
         assert((await page.locator('#nearby-source-state').innerText()).includes('parcial'),'INA_PARTIAL_VISIBLE_'+w);
         const pulse=await page.locator('#source-pulse').innerText();
         assert(pulse.includes('RÍOS / INA')&&pulse.includes('PARCIAL'),'INA_SCOPED_DEGRADATION_'+w,pulse);
         assert(pulse.includes('ALERTAS SMN')&&pulse.includes('ACTUAL'),'SMN_UNPOISONED_BY_INA_'+w,pulse);
       }
       if(state==='SMN_DEGRADED'){
         const pulse=await page.locator('#source-pulse').innerText();
         assert(pulse.includes('ALERTAS SMN')&&pulse.includes('DEGRADADO'),'SMN_SCOPED_DEGRADATION_'+w,pulse);
         assert(pulse.includes('RÍOS / INA')&&pulse.includes('ACTUAL'),'INA_UNPOISONED_BY_SMN_'+w,pulse);
       }
       if(state==='RIVER_UNKNOWN'){
         const first=await page.locator('[data-observation-id="ina:river:30"]').innerText();
         assert(first.includes('—'),'UNKNOWN_RIVER_NOT_ZERO_'+w,first);
         assert(!/\b0(?:[,.]0+)?\s*m\b/.test(first),'UNKNOWN_RIVER_NO_FAKE_ZERO_'+w,first);
       }
       if(state==='VERIFIED_EMPTY'){
         const txt=await page.locator('#event-list').innerText();
         assert(txt.includes('No hay alertas oficiales activas verificadas'),'VERIFIED_EMPTY_EXACT_'+w,txt);
         assert(await page.locator('.river-card').count()===2,'RIVERS_COEXIST_WITH_NO_WARNINGS_'+w);
       }
       await page.screenshot({path:path.join(shotDir,w+'x'+h+'-'+state+'.png'),fullPage:true});
       report.visualMatrix.viewports[w+'x'+h][state]={status:'PASS',elapsedMs};
       report.visualMatrix.states++;
       report.consoleErrors.push(...consoleErrors.map(x=>w+'/'+state+':'+x));
       report.pageErrors.push(...pageErrors.map(x=>w+'/'+state+':'+x));
       await context.close();
     }
   }

   // Santa Fe reference acceptance and canonical map/list parity.
   {
     const context=await browser.newContext({viewport:{width:412,height:914},serviceWorkers:'block'});
     await context.addInitScript(()=>{
       window.__geoCalls=0;window.__notificationCalls=0;
       Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(){window.__geoCalls++}}});
       class N{};N.requestPermission=async()=>{window.__notificationCalls++;return'denied'};Object.defineProperty(window,'Notification',{configurable:true,value:N});
     });
     const page=await context.newPage();const requests=[];
     page.on('request',r=>requests.push(r.url()));
     await routeApis(page,'ACTIVE');await page.route('https://**/*',r=>r.abort());
     const t=Date.now();await page.goto(BASE+'/',{waitUntil:'networkidle',timeout:30000});const elapsed=Date.now()-t;
     assert((await page.locator('#reference-kind').innerText()).includes('ÁREA DE EXPLORACIÓN'),'DEFAULT_REFERENCE_TRUTH');
     assert(!(await page.locator('#reference-kind').innerText()).includes('TU ZONA'),'DEFAULT_NOT_FALSE_PERSONAL');
     assert(await page.locator('.river-card').count()===2,'SANTA_FE_HYDROLOGY_PRESENT_BEFORE_PERSONALIZATION');
     const riverText=await page.locator('[data-observation-id="ina:river:30"]').innerText();
     assert(/2[,.]65\s*m/.test(riverText),'PARANA_LEVEL_VISIBLE',riverText);
     assert(/Bajó 5 cm en 24 h/.test(riverText),'PARANA_DELTA_VISIBLE',riverText);
     await page.locator('#manual-location').click();
     await page.locator('#place').fill('Santa Fe');
     await page.locator('#search').click();
     await page.waitForSelector('#search-results button');
     await page.locator('#search-results button').first().click();
     await page.waitForFunction(()=>document.querySelector('#reference-kind')?.textContent.includes('LOCALIDAD SELECCIONADA'));
     assert((await page.locator('#selected-location').innerText()).includes('Santa Fe'),'MANUAL_SANTA_FE_REFERENCE_VISIBLE');
     assert((await page.locator('#reference-kind').innerText()).includes('LOCALIDAD SELECCIONADA'),'MANUAL_REFERENCE_KIND_VISIBLE');
     const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('aphora-last-manual-reference')||'null'));
     assert(stored&&stored.name.includes('Santa Fe')&&stored.mode==='manual','MANUAL_REFERENCE_PERSISTED',JSON.stringify(stored));
     await page.reload({waitUntil:'networkidle'});
     assert((await page.locator('#reference-kind').innerText()).includes('LOCALIDAD SELECCIONADA'),'MANUAL_REFERENCE_RESTORED');
     assert((await page.locator('#selected-location').innerText()).includes('Santa Fe'),'MANUAL_REFERENCE_NAME_RESTORED');
     const beforeMapExternal=requests.filter(u=>!u.startsWith(BASE+'/')).length;
     await page.locator('nav button[data-view="map"]').click();
     await page.waitForSelector('#map-view:not([hidden])');
     await page.waitForTimeout(150);
     const ids=await page.locator('#map-markers [data-map-event-id]').evaluateAll(ns=>ns.map(n=>n.getAttribute('data-map-event-id')).sort());
     for(const id of ['event:smn:wind-a','event:smn:wind-b','event:inpres:q1'])assert(ids.includes(id),'MAP_CANONICAL_ID_'+id,JSON.stringify(ids));
     assert(await page.locator('#event-list [data-detail="event:smn:wind-a"]').count()===1,'LIST_DETAIL_ID_WIND_A');
     assert(await page.locator('#event-list [data-detail="event:smn:wind-b"]').count()===1,'LIST_DETAIL_ID_WIND_B');
     await page.locator('nav button[data-view="now"]').click();
     const pulse=await page.locator('#source-pulse').innerText();
     assert(pulse.includes('ALERTAS SMN')&&pulse.includes('RÍOS / INA')&&pulse.includes('SISMOS / INPRES'),'SOURCE_SCOPES_VISIBLE',pulse);
     assert(elapsed<5000,'INITIAL_RENDER_UNDER_5S',String(elapsed));
     const perf=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];const paints=Object.fromEntries(performance.getEntriesByType('paint').map(x=>[x.name,x.startTime]));return{domContentLoaded:n?.domContentLoadedEventEnd??null,load:n?.loadEventEnd??null,paints,resources:performance.getEntriesByType('resource').length}});
     report.santaFeAcceptance='PASS';
     report.performance={elapsedMs:elapsed,metrics:perf};
     report.initialPrivacy={geoCalls:await page.evaluate(()=>window.__geoCalls),notificationCalls:await page.evaluate(()=>window.__notificationCalls),externalInitialRequests:beforeMapExternal};
     await context.close();
   }

   // Reduced motion.
   {
     const context=await browser.newContext({viewport:{width:412,height:914},serviceWorkers:'block',reducedMotion:'reduce'});
     const page=await context.newPage();await routeApis(page,'ACTIVE');await page.route('https://**/*',r=>r.abort());
     await page.goto(BASE+'/',{waitUntil:'networkidle'});await page.locator('#refresh').click();await page.waitForTimeout(50);
     const motion=await page.evaluate(()=>({sweep:getComputedStyle(document.querySelector('.situation-canvas'),'::after').animationName,line:getComputedStyle(document.querySelector('.proximity-link'),'::before').animationName,scroll:getComputedStyle(document.documentElement).scrollBehavior}));
     assert(motion.sweep==='none'&&motion.line==='none','REDUCED_MOTION_NO_ANIMATION',JSON.stringify(motion));
     report.reducedMotion='PASS';
     await context.close();
   }

   const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
   const css=fs.readFileSync(path.join(ROOT,'app.css'),'utf8');
   const js=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
   const workerPath=path.resolve(ROOT,'..','src','worker','index.js');
   const worker=fs.existsSync(workerPath)?fs.readFileSync(workerPath,'utf8'):'';
   const staticChecks={
     noRemoteFonts:!/@import\s+url|fonts\.googleapis|fonts\.gstatic/i.test(css+html),
     noTrackers:!/google-analytics|googletagmanager|segment\.com|hotjar|facebook\.net/i.test(html+js),
     gpsExplicit:/#use-location|use-location/.test(js)&&/getCurrentPosition/.test(js),
     notificationExplicit:/push-optin/.test(js)&&/Notification\.requestPermission/.test(js),
     cspPresent:/Content-Security-Policy/.test(worker)&&/default-src 'self'/.test(worker)&&/frame-ancestors 'none'/.test(worker),
     noPositionHistory:!/position-history|location-history/i.test(js)
   };
   assert(Object.values(staticChecks).every(Boolean),'STATIC_PERFORMANCE_PRIVACY_SECURITY',JSON.stringify(staticChecks));
   const budgets={cssBytes:Buffer.byteLength(css),jsBytes:Buffer.byteLength(js),cssGzip:zlib.gzipSync(css).length,jsGzip:zlib.gzipSync(js).length};
   assert(budgets.cssGzip<=30000&&budgets.jsGzip<=125000,'FRONTEND_GZIP_BUDGET',JSON.stringify(budgets));
   assert(report.axe.serious===0&&report.axe.critical===0,'AXE_SERIOUS_CRITICAL_ZERO',JSON.stringify(report.axe.details));
   assert(report.consoleErrors.length===0&&report.pageErrors.length===0,'RUNTIME_ERRORS_ZERO',JSON.stringify({console:report.consoleErrors,page:report.pageErrors}));
   report.staticChecks=staticChecks;
   report.budgets=budgets;
   report.axe.status='PASS';
   report.visualMatrix.status='PASS';
   report.performancePrivacySecurity='PASS';
   report.overall='PASS';
   fs.writeFileSync(path.join(OUT,REPORT_NAME),JSON.stringify(report,null,2)+'\n');
   console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();server.close()}
})().catch(e=>{try{server.close()}catch{};console.error(e.stack||e);process.exit(1)});
