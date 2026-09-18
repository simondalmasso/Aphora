import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUpstreamUrl,safeFetch} from '../src/worker/transport.js';
import {handlePush} from '../src/worker/push.js';
const policy={hosts:['example.com'],paths:[/^\/ok$/],maxBytes:1024,timeoutMs:1000,contentTypes:['json'],accept:'application/json'};
test('SSRF_PRIVATE_TARGET_REJECTED',()=>assert.throws(()=>validateUpstreamUrl('https://127.0.0.1/ok',policy),/UPSTREAM_NOT_ALLOWLISTED/));
test('SSRF_UNLISTED_HOST_REJECTED',()=>assert.throws(()=>validateUpstreamUrl('https://invalid.example/ok',policy),/UPSTREAM_NOT_ALLOWLISTED/));
test('REDIRECT_TARGET_REVALIDATED',async()=>{const real=globalThis.fetch;globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://invalid.example/ok'}});try{await assert.rejects(()=>safeFetch('https://example.com/ok',policy),/UPSTREAM_NOT_ALLOWLISTED/)}finally{globalThis.fetch=real}});
test('ORIGIN_GUARD_REJECTS_UNTRUSTED_PUSH_MUTATION',async()=>{const url=new URL('https://sos-sf.simondalmasso44.workers.dev/api/push/subscribe');const r=await handlePush(new Request(url,{method:'POST',headers:{origin:'https://invalid.example','content-type':'application/json'},body:'{}'}),{},url);assert.equal(r.status,403);const x=await r.json();assert.equal(x.error.code,'ORIGIN_REJECTED')});
