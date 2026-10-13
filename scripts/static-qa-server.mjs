import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root=path.resolve(process.env.APHORA_QA_ROOT||'dist/public');
const port=Number(process.env.APHORA_QA_PORT||8790);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
http.createServer((req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url||'/',`http://127.0.0.1:${port}`).pathname)}catch{res.writeHead(400);res.end('bad request');return}
  const rel=pathname==='/'?'index.html':pathname.replace(/^\/+/,''),file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep)&&file!==path.join(root,'index.html')){res.writeHead(403);res.end('forbidden');return}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('not found');return}
  res.writeHead(200,{'content-type':types[path.extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});
  fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>process.stdout.write(`APHORA exact-dist preview on http://127.0.0.1:${port}/ root=${root}\n`));
