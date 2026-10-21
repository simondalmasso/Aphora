const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
export function createZonesView(ctx){
 const zones=ctx.zones,api=ctx.api,esc=ctx.esc,hazardIcon=ctx.hazardIcon,hazardName=ctx.hazardName,compareRelevant=ctx.compareRelevant,proximityForEvent=ctx.proximityForEvent,bboxFromRadius=ctx.bboxFromRadius;
 function setUnavailable(card){if(!card)return;const state=card.querySelector('.zone-state'),proximity=card.querySelector('.zone-proximity'),pill=card.querySelector('.status-pill');if(state)state.textContent='Estado actual no verificable.';if(proximity)proximity.textContent='No se calcula distancia sin geometría y datos verificables.';if(pill)pill.textContent='NO VERIFICABLE'}
 async function render(){
  const list=zones(),host=$('#zone-list');
  if(!list.length){host.innerHTML='<div class="empty-state"><strong>No guardaste zonas todavía.</strong><span>Elegí un área y guardala para volver rápido.</span></div>';return}
  host.innerHTML=list.map((z,i)=>'<article class="zone-card" data-zone-card="'+i+'"><div class="zone-card-head"><div class="zone-title"><span class="zone-icon">'+hazardIcon('ZONE')+'</span><div><h3>'+esc(z.name)+'</h3><p>'+esc(z.province||'Área guardada')+' · radio '+esc(Number(z.radiusKm)||25)+' km</p></div></div><span class="status-pill">VERIFICANDO</span></div><div class="zone-hazards"></div><p class="zone-state">Consultando actividad actual…</p><p class="zone-proximity muted"></p><div class="zone-actions"><button class="quiet" type="button" data-z-open="'+i+'">Ver</button><button class="quiet" type="button" data-z="'+i+'">Quitar</button></div></article>').join('');
  $$('[data-z-open]').forEach(b=>b.onclick=()=>{const z=zones()[Number(b.dataset.zOpen)];if(!z)return;const r=Math.max(2,Math.min(100,Number(z.radiusKm)||25));ctx.onOpenZone(z,r)});
  $$('[data-z]').forEach(b=>b.onclick=()=>{const a=zones();a.splice(Number(b.dataset.z),1);localStorage.setItem('sos-zones',JSON.stringify(a));void render()});
  const requests=list.map((z,i)=>({id:String(i),bbox:bboxFromRadius(z.lon,z.lat,Math.max(Number(z.radiusKm)||25,100))}));
  let batch;
  try{batch=await api('/api/events/batch',{method:'POST',body:JSON.stringify({zones:requests})})}catch{list.forEach((z,i)=>setUnavailable($('[data-zone-card="'+i+'"]')));return}
  const byId=new Map((batch.data?.zones||[]).map(z=>[String(z.id),z]));
  for(let i=0;i<list.length;i++){
   const z=list[i],card=$('[data-zone-card="'+i+'"]'),data=byId.get(String(i));
   if(!card)continue;if(!data){setUnavailable(card);continue}
   const r=Math.max(2,Math.min(100,Number(z.radiusKm)||25)),ref={...z,radiusKm:r,mode:'zone'},ranked=[...(data.events||[])].sort((a,b)=>compareRelevant(a,b,ref)),inside=ranked.filter(e=>proximityForEvent(e,ref)?.inside),nearest=ranked.find(e=>{const p=proximityForEvent(e,ref);return p&&!p.inside}),hazards=[...new Set(ranked.slice(0,4).map(e=>e.hazardType))];
   card.querySelector('.zone-hazards').innerHTML=hazards.map(h=>'<span class="zone-hazard" title="'+esc(hazardName(h))+'">'+hazardIcon(h)+'<span>'+esc(hazardName(h))+'</span></span>').join('');
   card.querySelector('.zone-state').textContent=ranked.length+' evento(s) relevante(s) · '+inside.length+' dentro del área';
   const near=nearest?proximityForEvent(nearest,ref):null;
   card.querySelector('.zone-proximity').textContent=near?hazardName(nearest.hazardType)+' '+near.label.toLowerCase():(inside.length?'Hay actividad dentro del radio guardado.':'Sin distancia verificable adicional.');
   const pill=card.querySelector('.status-pill'),state=data.verification?.officialWarningFeed||'';
   pill.textContent=state.includes('DEGRADED')?'DEGRADADO':state==='FRESH_NO_ACTIVE_WARNINGS'||state==='ACTIVE_WARNINGS_VERIFIED'?'ACTUAL':'NO VERIFICABLE';
   pill.className='status-pill '+(state.includes('DEGRADED')?'degraded':state==='FRESH_NO_ACTIVE_WARNINGS'||state==='ACTIVE_WARNINGS_VERIFIED'?'verified':'');
  }
 }
 return{render};
}
