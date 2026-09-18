import {chromium} from 'playwright';
const BASE='http://'+['127','0','0','1'].join('.')+':8790';
const b=await chromium.launch({headless:true,executablePath:chromium.executablePath()});
const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});const p=await c.newPage();
p.on('console',m=>console.log('CONSOLE',m.type(),m.text()));p.on('requestfailed',r=>console.log('FAILED',r.url(),r.failure()));
await p.goto(BASE+'/',{waitUntil:'networkidle',timeout:30000});
console.log('controller1',await p.evaluate(()=>!!navigator.serviceWorker.controller));
await p.evaluate(()=>navigator.serviceWorker.ready);
await p.reload({waitUntil:'networkidle',timeout:30000});
console.log('controller2',await p.evaluate(()=>!!navigator.serviceWorker.controller));
await c.setOffline(true);
try{await p.reload({waitUntil:'domcontentloaded',timeout:30000});}catch(e){console.log('RELOAD_ERR',e.message)}
await p.waitForTimeout(1500);
console.log('URL',p.url());
console.log('BODY',((await p.locator('body').textContent().catch(()=>''))||'').slice(0,4000));
console.log('HTML',((await p.content().catch(()=>''))||'').slice(0,2000));
await c.setOffline(false);await c.close();await b.close();
