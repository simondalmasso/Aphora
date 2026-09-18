import fs from'node:fs';
import path from'node:path';
import crypto from'node:crypto';
const out='dist',release=process.env.ORDER031_RELEASE_ID||'ORDER031-PREFREEZE',builtAt=process.env.ORDER031_BUILT_AT||new Date().toISOString();
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const d of ['public','src','migrations'])fs.cpSync(d,`${out}/${d}`,{recursive:true});
for(const f of [`${out}/public/service-worker.js`,`${out}/public/index.html`]){let s=fs.readFileSync(f,'utf8');s=s.replaceAll('__ORDER031_RELEASE_ID__',release);fs.writeFileSync(f,s)}
const files=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else{const b=fs.readFileSync(p);files.push({path:p.slice(out.length+1),bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')})}}}walk(out);files.sort((a,b)=>a.path.localeCompare(b.path));
fs.writeFileSync(`${out}/manifest.json`,JSON.stringify({schema:'SOS-SF-ORDER031-DIST/v1',releaseId:release,builtAt,files},null,2)+'\n');
console.log(`built ${files.length} files release=${release}`);
