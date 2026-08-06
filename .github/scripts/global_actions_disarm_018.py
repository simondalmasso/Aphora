import base64, hashlib, json, os, re, time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

TOKEN=os.environ['GH_TOKEN']
REPO=os.environ['GITHUB_REPOSITORY']
API='https://api.github.com/repos/'+REPO
EVIDENCE=Path(os.environ['EVIDENCE_DIR'])
EVIDENCE.mkdir(parents=True,exist_ok=True)
DEFINITIONS=EVIDENCE/'definitions'
DEFINITIONS.mkdir(exist_ok=True)
SELF_PATH=os.environ['SELF_PATH']
BRANCH=os.environ['GITHUB_REF_NAME']
HEAD=os.environ['GITHUB_SHA']
EXPECTED_TAKE=os.environ['EXPECTED_TAKE_HEAD']

def request(path, method='GET', payload=None, allow_404=False):
    url=path if path.startswith('http') else API+path
    data=None if payload is None else json.dumps(payload).encode()
    req=Request(url,data=data,method=method,headers={
        'Authorization':'Bearer '+TOKEN,
        'Accept':'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'sos-sf-global-disarm-018',
    })
    try:
        with urlopen(req,timeout=60) as r:
            raw=r.read()
            return None if not raw else json.loads(raw)
    except HTTPError as e:
        body=e.read().decode(errors='replace')
        if allow_404 and e.code==404:
            return None
        raise RuntimeError(f'{method} {url} -> {e.code}: {body[:500]}')

def paginate(path, key):
    out=[]; page=1
    while True:
        sep='&' if '?' in path else '?'
        obj=request(f'{path}{sep}per_page=100&page={page}')
        batch=obj.get(key,[])
        out.extend(batch)
        if len(batch)<100:
            break
        page+=1
    return out

file_cache={}
def fetch_content(path, ref):
    k=(path,ref)
    if k in file_cache:
        return file_cache[k]
    q=urlencode({'ref':ref})
    obj=request('/contents/'+quote(path,safe='/')+'?'+q,allow_404=True)
    if not obj or isinstance(obj,list) or obj.get('type')!='file':
        file_cache[k]=None; return None
    try:
        content=base64.b64decode(obj.get('content','')).decode('utf-8')
    except Exception:
        content=None
    file_cache[k]=content
    return content

def extract_run_blocks(text):
    lines=text.splitlines(); blocks=[]; i=0
    while i<len(lines):
        line=lines[i]; m=re.match(r'^(\s*)run:\s*(.*)$',line)
        if not m:
            i+=1; continue
        indent=len(m.group(1)); rest=m.group(2).strip()
        if rest and rest not in ('|','>','|-','>-','|+','>+'):
            blocks.append(rest); i+=1; continue
        buf=[]; i+=1
        while i<len(lines):
            nxt=lines[i]
            if nxt.strip() and len(nxt)-len(nxt.lstrip())<=indent:
                break
            buf.append(nxt[indent+2:] if len(nxt)>=indent+2 else '')
            i+=1
        blocks.append('\n'.join(buf))
    return blocks

def extract_events_branches(text):
    lines=text.splitlines(); block=[]; base_indent=0
    for idx,line in enumerate(lines):
        m=re.match(r'^(\s*)(?:on|["\']on["\']):\s*(.*)$',line)
        if not m: continue
        base_indent=len(m.group(1)); tail=m.group(2).strip()
        if tail: block.append(tail)
        for nxt in lines[idx+1:]:
            if nxt.strip() and len(nxt)-len(nxt.lstrip())<=base_indent:
                break
            block.append(nxt)
        break
    joined='\n'.join(block)
    events=sorted(set(re.findall(r'(?m)^\s{2,}([A-Za-z_][A-Za-z0-9_-]*):',joined)))
    if not events and joined:
        events=sorted(set(re.findall(r'[A-Za-z_][A-Za-z0-9_-]*',joined)))
    branches=sorted(set(re.findall(r'(?m)(?:branches|branches-ignore):\s*\[?([^\]\n]+)',joined)))
    return events,branches

def classify(text):
    blocks=extract_run_blocks(text)
    commands='\n'.join(blocks)
    lower=text.lower()
    anchored=lambda pattern: bool(re.search(pattern,commands,re.I|re.M))
    deploy=(
        anchored(r'^\s*(?:sudo\s+)?(?:npx\s+)?wrangler\s+(?:deploy|publish|rollback)\b') or
        anchored(r'^\s*(?:sudo\s+)?(?:npx\s+)?wrangler\s+versions\s+(?:upload|deploy)\b') or
        anchored(r'^\s*(?:npm|pnpm|yarn)\s+(?:run\s+)?deploy(?:\s|$|:)') or
        anchored(r'^\s*(?:node|bash|sh)\s+[^\n]*(?:deploy|release)[^\n]*(?:cloudflare|worker|wrangler)') or
        ('cloudflare/wrangler-action' in lower and bool(re.search(r'(?mi)^\s*command:\s*(?:deploy|publish|versions\s+(?:upload|deploy))\b',text)))
    )
    remote_migration=(
        anchored(r'^\s*(?:npx\s+)?wrangler\s+d1\s+migrations\s+apply\b[^\n]*--remote') or
        anchored(r'^\s*(?:npx\s+)?wrangler\s+d1\s+execute\b[^\n]*--remote') or
        anchored(r'^\s*(?:npm|pnpm|yarn)\s+(?:run\s+)?[^\n]*(?:migrate|migration)[^\n]*(?:remote|cloudflare|d1)')
    )
    provisioning=(
        anchored(r'^\s*(?:node\s+)?(?:\./)?scripts/provision-cloudflare\.mjs\b') or
        anchored(r'^\s*(?:npx\s+)?wrangler\s+(?:d1|kv|r2)\s+[^\n]*(?:create|delete|put|bulk)\b') or
        anchored(r'^\s*(?:npx\s+)?wrangler\s+kv:(?:namespace|key|bulk)\s+[^\n]*(?:create|delete|put)\b') or
        anchored(r'^\s*(?:node|bash|sh)\s+[^\n]*(?:provision|create-resources|ensure-resources)[^\n]*(?:cloudflare|worker|d1|kv|r2)') or
        anchored(r'^\s*node\s+scripts/verify-kv-namespace\.mjs\b')
    )
    secret_write=(
        anchored(r'^\s*(?:npx\s+)?wrangler\s+secret\s+(?:put|delete|bulk)\b') or
        anchored(r'^\s*(?:node|bash|sh)\s+[^\n]*(?:write|set|delete|sync)[^\n]*secret')
    )
    api_mutation=False
    for block in blocks:
        if 'api.cloudflare.com' not in block.lower():
            continue
        if re.search(r'(?mi)^\s*curl\b[^\n]*(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)\b',block): api_mutation=True
        if re.search(r'(?i)method\s*[:=]\s*["\'](?:POST|PUT|PATCH|DELETE)["\']',block): api_mutation=True
        if re.search(r'(?i)requests\.(?:post|put|patch|delete)\s*\(',block): api_mutation=True
    categories={'deploy':deploy,'remote_migration':remote_migration,'provisioning':provisioning,'secret_write':secret_write,'cloudflare_api_mutation':api_mutation}
    categories['production_mutation']=any(categories.values())
    categories['cloudflare_credentials_referenced']=('cloudflare_api_token' in lower or 'cloudflare_account_id' in lower)
    return categories

def inventory(label):
    workflows=paginate('/actions/workflows','workflows'); rows=[]
    for wf in workflows:
        runs=paginate(f"/actions/workflows/{wf['id']}/runs",'workflow_runs')
        refs=[HEAD,EXPECTED_TAKE,BRANCH,'main']+[r.get('head_sha') for r in runs if r.get('head_sha')]
        seen_refs=[]
        for ref in refs:
            if ref and ref not in seen_refs: seen_refs.append(ref)
        defs=[]; seen_hash={}
        for ref in seen_refs:
            content=fetch_content(wf['path'],ref)
            if content is None: continue
            digest=hashlib.sha256(content.encode()).hexdigest()
            if digest in seen_hash:
                seen_hash[digest]['refs'].append(ref); continue
            events,branches=extract_events_branches(content)
            entry={'sha256':digest,'refs':[ref],'events':events,'branches':branches,'classification':classify(content)}
            seen_hash[digest]=entry; defs.append(entry)
            (DEFINITIONS/f"{wf['id']}-{digest[:16]}.yml").write_text(content)
        keys=['deploy','remote_migration','provisioning','secret_write','cloudflare_api_mutation','production_mutation','cloudflare_credentials_referenced']
        effective={k:False for k in keys}
        for d in defs:
            for k,v in d['classification'].items(): effective[k]=effective[k] or bool(v)
        row={'id':wf['id'],'name':wf['name'],'path':wf['path'],'state':wf['state'],'created_at':wf.get('created_at'),'updated_at':wf.get('updated_at'),'run_count':len(runs),'run_ids':[r['id'] for r in runs],'historical_rerun_possible':bool(runs) and wf['state']=='active','definitions':defs,'effective':effective}
        row['rerunnable_production_mutation']=row['historical_rerun_possible'] and effective['production_mutation']
        rows.append(row)
    payload={'label':label,'generated_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'registered_workflow_count':len(rows),'workflows':rows}
    (EVIDENCE/f'workflow-inventory-{label}.json').write_text(json.dumps(payload,indent=2,sort_keys=True)+'\n')
    return payload

before=inventory('before')
active_before=sum(1 for w in before['workflows'] if w['state']=='active')
disabled=[]
for w in before['workflows']:
    if w['state']=='active' and w['effective']['production_mutation'] and w['path']!=SELF_PATH:
        request(f"/actions/workflows/{w['id']}/disable",method='PUT'); disabled.append(w['id'])
if 327422092 not in disabled:
    target=next((w for w in before['workflows'] if w['id']==327422092),None)
    if target and target['state']=='active':
        request('/actions/workflows/327422092/disable',method='PUT'); disabled.append(327422092)
time.sleep(3)
after=inventory('after-production-disarm')
active_mut=[w for w in after['workflows'] if w['state']=='active' and w['effective']['production_mutation']]
counters={
    'ACTIVE_CLOUDFLARE_MUTATION_WORKFLOWS':len(active_mut),
    'ACTIVE_DEPLOY_WORKFLOWS':sum(1 for w in active_mut if w['effective']['deploy']),
    'ACTIVE_REMOTE_MIGRATION_WORKFLOWS':sum(1 for w in active_mut if w['effective']['remote_migration']),
    'ACTIVE_PROVISIONING_WORKFLOWS':sum(1 for w in active_mut if w['effective']['provisioning']),
    'ACTIVE_SECRET_WRITE_WORKFLOWS':sum(1 for w in active_mut if w['effective']['secret_write']),
    'RERUNNABLE_PRODUCTION_MUTATION_PATHS':sum(1 for w in after['workflows'] if w['rerunnable_production_mutation']),
}
if any(counters.values()): raise SystemExit('NONZERO_MUTATION_GATE:'+json.dumps(counters,sort_keys=True))
self_wf=next((w for w in after['workflows'] if w['path']==SELF_PATH),None)
if not self_wf: raise SystemExit('SELF_WORKFLOW_NOT_REGISTERED')
result={'registered_workflow_count':before['registered_workflow_count'],'active_workflow_count_before':active_before,'disabled_mutation_workflow_ids':sorted(set(disabled)),'self_workflow_id':self_wf['id'],**counters}
(EVIDENCE/'disarm-result-pre-self.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
print(json.dumps(result))
