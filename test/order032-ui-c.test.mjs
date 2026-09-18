import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const sw=fs.readFileSync('public/service-worker.js','utf8');

const rendered=html+'\n'+app+'\n'+css;

test('OPTION_C_RADAR_FIRST_HIERARCHY',()=>{
  assert.match(html,/class="[^"]*\barea-now\b[^"]*"/);
  assert.match(html,/id="situation-canvas"/);
  assert.ok(html.indexOf('id="situation-canvas"')<html.indexOf('id="top-relevant-panel"'));
  assert.match(css,/\.situation-canvas\{[^}]*height:clamp\(/s);
  assert.match(css,/@media\(min-width:900px\).*grid-template-columns:minmax\(0,3fr\) minmax\(320px,2fr\)/s);
});

test('TOP_EVENT_CONTENT_HIERARCHY_IS_OPERATIONAL',()=>{
  assert.match(app,/class="top-event-signal"/);
  assert.match(app,/class="top-source-line"/);
  assert.match(app,/class="proximity-diagram"/);
  assert.match(css,/\.event-summary\{[^}]*-webkit-line-clamp:3/s);
});

test('REAL_SITUATION_EVENT_GEOMETRY_RENDERS_POINT_BBOX_AND_AREA',()=>{
  assert.match(app,/function situationPoint\(/);
  assert.match(app,/kind:'point'/);
  assert.match(app,/kind:'bbox'/);
  assert.match(app,/kind:'area'/);
  assert.match(app,/fill-rule="evenodd"/);
  assert.doesNotMatch(app,/span>2.*kind:'area'.*kind:'point'/s);
});

test('PROXIMITY_SEMANTICS_REMAIN_REAL_AND_SIGNATURE_VISUAL',()=>{
  assert.match(app,/distanceToEvent\(/);
  assert.match(app,/distanceToPolygonKm\(/);
  assert.match(app,/if\(!info\)return null/);
  assert.match(app,/function proximityDiagram\(/);
  assert.match(app,/DENTRO DE TU ZONA/);
});

test('HAZARD_ACTIVITY_RETAINS_ZERO_AND_UNKNOWN',()=>{
  assert.match(app,/Number\.isFinite\(Number\(v\)\)/);
  assert.match(app,/known\?String\(n\):'—'/);
  const hazardRenderer=app.match(/function renderBars\(obj,host\)[\s\S]*?function renderZoneBars/)?.[0]||'';
  assert.doesNotMatch(hazardRenderer,/Object\.entries\(obj\|\|\{\}\)\.filter\(\(\[,v\]\)=>Number\(v\)>0\)/);
});

test('MOTION_IS_ONE_SHOT_AND_REDUCED_MOTION_SAFE',()=>{
  assert.match(css,/animation:canvasSweep 600ms[^;]*1/);
  assert.doesNotMatch(css,/animation[^;}]*infinite/i);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*\.proximity-link::before[\s\S]*animation:none!important/);
  assert.match(app,/loadOverview\(\{animate:true\}/);
});

test('ATOMIC_PWA_USES_RELEASE_SPECIFIC_CURRENT_CACHE_ONLY',()=>{
  assert.match(sw,/aphora-shell-\$\{RELEASE\}/);
  assert.match(sw,/skipWaiting\(\)/);
  assert.match(sw,/clients\.claim\(\)/);
  assert.doesNotMatch(sw,/\bcaches\.match\(/);
  assert.match(sw,/caches\.open\(SHELL_CACHE\)/);
  assert.match(sw,/request\.mode==='navigate'/);
  assert.match(sw,/networkRelease===RELEASE/);
});

test('HTML_SHELL_ASSETS_ARE_RELEASE_VERSIONED',()=>{
  assert.match(html,/name="aphora-release" content="__ORDER031_RELEASE_ID__"/);
  assert.match(html,/href="\/app\.css\?v=__ORDER031_RELEASE_ID__"/);
  assert.match(html,/src="\/app\.js\?v=__ORDER031_RELEASE_ID__"/);
});

test('GENERATION_CONSISTENCY_HAS_SINGLE_CONTROLLED_RELOAD_GUARD',()=>{
  assert.match(app,/APHORA_SHELL_GENERATION/);
  assert.match(app,/aphora-shell-reload:/);
  assert.match(app,/sessionStorage\.getItem/);
  assert.match(app,/location\.reload\(\)/);
});

test('ATOMIC_PWA_SIMULATION_NEVER_READS_OLD_CSS_OR_JS',async()=>{
  const source=sw.replaceAll('__ORDER031_RELEASE_ID__','V3.1');
  const handlers={};
  const stores=new Map();
  const keyOf=req=>typeof req==='string'?req:new URL(req.url).pathname+new URL(req.url).search;
  const makeCache=name=>({
    async match(req){return stores.get(name)?.get(keyOf(req))?.clone?.()||stores.get(name)?.get(keyOf(req))||null},
    async put(req,res){if(!stores.has(name))stores.set(name,new Map());stores.get(name).set(keyOf(req),res.clone?res.clone():res)},
    async addAll(){return undefined}
  });
  stores.set('aphora-shell-V3-HF2',new Map([
    ['/app.css?v=V3-HF2',new Response('OLD_CSS')],
    ['/app.js?v=V3-HF2',new Response('OLD_JS')]
  ]));
  stores.set('aphora-shell-V3.1',new Map([
    ['/app.css?v=V3.1',new Response('NEW_CSS')],
    ['/app.js?v=V3.1',new Response('NEW_JS')],
    ['/index.html',new Response('<meta name="aphora-release" content="V3.1">HTML_NEW',{headers:{'content-type':'text/html'}})]
  ]));
  const context={
    URL,Response,Headers,Request,setTimeout,clearTimeout,indexedDB:{open(){throw new Error('unused')}},
    self:{location:{origin:'https://aphora.test'},registration:{update:async()=>{}},skipWaiting:async()=>{},clients:{claim:async()=>{},matchAll:async()=>[]},addEventListener(t,fn){handlers[t]=fn}},
    clients:{matchAll:async()=>[],openWindow:async()=>{}},
    caches:{open:async name=>makeCache(name),keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name)},
    fetch:async req=>{const u=new URL(req.url||req);if(u.pathname==='/')return new Response('<meta name="aphora-release" content="V3.1">HTML_NEW',{headers:{'content-type':'text/html'}});return new Response('NETWORK_'+u.pathname,{status:200})},
    console
  };
  vm.runInNewContext(source,context);
  async function dispatch(path,mode='cors'){
    let response;
    const request={url:'https://aphora.test'+path,method:'GET',mode,headers:new Headers(),clone(){return this}};
    handlers.fetch({request,respondWith(p){response=Promise.resolve(p)}});
    return response;
  }
  assert.equal(await (await dispatch('/app.css?v=V3.1')).text(),'NEW_CSS');
  assert.equal(await (await dispatch('/app.js?v=V3.1')).text(),'NEW_JS');
  assert.notEqual(await (await dispatch('/app.css?v=V3.1')).text(),'OLD_CSS');
  assert.notEqual(await (await dispatch('/app.js?v=V3.1')).text(),'OLD_JS');
});

test('MAP_LIST_PARITY_AND_ZERO_INITIAL_SIDE_EFFECTS_PRESERVED',()=>{
  assert.match(app,/for\(const e of events\).*dataset\.eventId=e\.eventId/s);
  assert.match(app,/for\(const e of events\).*dataset\.mapEventId=e\.eventId/s);
  const init=app.slice(app.lastIndexOf("show('now')"));
  assert.doesNotMatch(init,/getCurrentPosition|Notification\.requestPermission|renderMap\(|loadGibsLayer\(/);
});

test('NO_EMOJI_REMOTE_FONTS_TRACKERS_OR_INITIAL_EXTERNAL_MAP',()=>{
  const emoji=/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.equal(emoji.test(html+'\n'+app),false);
  assert.doesNotMatch(rendered,/fonts\.googleapis|@font-face|googletagmanager\.com|posthog\.com|segment\.com|mixpanel\.com/i);
  assert.doesNotMatch(html,/id="argenmap"[^>]+src=/);
  assert.doesNotMatch(html,/gibs\.earthdata|wms\.ign\.gob\.ar/i);
});

test('FRONTEND_BYTE_OWNER_IDENTITY',()=>{
  assert.ok(fs.readFileSync('src/client/app.js').equals(fs.readFileSync('public/app.js')));
});
