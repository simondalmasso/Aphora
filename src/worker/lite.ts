import type { Snapshot } from '../domain/snapshot.ts';
import { formatLocalDateTime } from '../domain/public-safety.ts';
import { withSecurityHeaders } from './security.ts';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

function alertHeading(snapshot: Snapshot): string {
  if (snapshot.alertStatus === 'ALERTA_OFICIAL_ACTIVA') return 'Alerta oficial activa';
  if (snapshot.alertStatus === 'SIN_ALERTAS_OFICIALES_DETECTADAS') return 'Sin alertas oficiales detectadas';
  if (snapshot.alertStatus === 'VERIFICACION_DE_ALERTAS_DEGRADADA') return 'La verificación de alertas está demorada';
  return 'No pudimos verificar alertas ahora';
}

function freshness(snapshot: Snapshot): string {
  if (snapshot.mode === 'OFFLINE') return 'Sin conexión';
  if (snapshot.freshness === 'ACTUALIZADO') return 'Al día';
  if (snapshot.freshness === 'ACTUALIZACION_DEMORADA') return 'Con demora';
  if (snapshot.freshness === 'DESACTUALIZADO') return 'Dato desactualizado';
  return 'Sin vigencia confirmada';
}

function systemFreshness(value: string | undefined): string {
  if (value === 'ACTUALIZADO') return 'Al día';
  if (value === 'ACTUALIZACION_DEMORADA') return 'Con demora';
  if (value === 'DESACTUALIZADO') return 'Desactualizado';
  return 'No disponible';
}

function sourceAvailability(value: string | undefined): string {
  if (value === 'OPERATIONAL_FRESH') return 'Disponible y vigente';
  if (value === 'OPERATIONAL_STALE') return 'Disponible con demora';
  if (value === 'SUPPLEMENTARY') return 'Información complementaria';
  if (value === 'BLOCKED_CREDENTIAL') return 'Requiere acceso oficial';
  if (value === 'BLOCKED_NO_MACHINE_ENDPOINT') return 'Consulta manual';
  if (value === 'REJECTED_UNSAFE') return 'No utilizado por seguridad';
  if (value === 'RETIRED') return 'Retirado';
  return 'Disponibilidad limitada';
}

export function liteResponse(snapshot: Snapshot): Response {
  const systems = snapshot.systems ?? [];
  const alerts = (snapshot.alerts ?? []).filter((alert) => alert.appliesToSantaFe && (alert.lifecycle === 'ACTIVE' || alert.lifecycle === 'UPDATED'));
  const contacts = [
    ['911', 'Emergencias'], ['103', 'COBEM'], ['107', 'Emergencias médicas'], ['100', 'Bomberos'], ['106', 'Emergencias náuticas'],
  ];
  const html = `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>SOS Santa Fe — modo liviano</title><style>
  :root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102f47;background:#f3f1eb;line-height:1.55}*{box-sizing:border-box}body{margin:0;background:linear-gradient(#f8f6f1,#f3f1eb 38rem);letter-spacing:-.006em}header,main,footer{max-width:760px;margin:auto;padding:20px}header{padding-top:30px}header strong.brand{display:inline-block;padding:7px 10px;border-radius:10px;background:#0b3049;color:#fff;font-size:.78rem;letter-spacing:.08em}h1,h2,h3{color:#08283f;line-height:1.08;letter-spacing:-.035em}h1{font-size:clamp(2.1rem,8vw,3.6rem);margin:.7rem 0 .5rem}header p{max-width:620px;color:#64747d}section{background:#fffdf8;border:1px solid rgba(16,47,71,.1);border-radius:20px;padding:18px;margin:14px 0}.alert{background:#edf3f1}.alert.critical{border-color:#d8aaaa;background:#fff1ef}.alert.attention{background:#f6efe5}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}.facts div{padding:11px;border-radius:13px;background:#edf3f1}.contacts{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}.contacts a{display:grid;padding:12px;border:1px solid rgba(16,47,71,.16);border-radius:13px;background:#fff;text-decoration:none;text-align:center}.contacts a:first-child{background:#edf3f1}small{color:#64747d}.warning{border-left:3px solid #b66b3d;padding:10px 12px;border-radius:0 12px 12px 0;background:#f6efe5}a{color:#08736f}table{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid rgba(16,47,71,.1);border-radius:12px}th,td{border-bottom:1px solid rgba(16,47,71,.1);padding:9px;text-align:left;font-size:.88rem}tr:last-child td{border-bottom:0}footer{color:#64747d;font-size:.88rem}@media(max-width:420px){header,main,footer{padding:14px}header{padding-top:22px}section{padding:15px;border-radius:17px}table{display:block;overflow:auto}}
  </style></head><body><header><strong class="brand">SOS SF</strong><h1>Ríos y alertas, en modo liviano</h1><p>La misma información pública esencial en una versión rápida, simple y sin JavaScript.</p><p><strong>Primero: nivel, vigencia, alertas verificadas y contactos.</strong> El detalle técnico queda disponible sin ocupar el primer plano.</p></header><main>
  <section class="alert ${snapshot.alertStatus === 'ALERTA_OFICIAL_ACTIVA' ? 'critical' : snapshot.alertStatus === 'SIN_ALERTAS_OFICIALES_DETECTADAS' ? '' : 'attention'}"><h2>${escapeHtml(alertHeading(snapshot))}</h2><p>${escapeHtml(snapshot.recommendedAction)}</p><p><strong>Última actualización:</strong> ${escapeHtml(formatLocalDateTime(snapshot.generatedAt))}</p>${alerts.map((alert) => `<article><h3>${escapeHtml(alert.headline)}</h3><p><strong>Área:</strong> ${escapeHtml(alert.area)}</p><p><strong>Emitida:</strong> ${escapeHtml(formatLocalDateTime(alert.sent))} · <strong>Válida hasta:</strong> ${escapeHtml(formatLocalDateTime(alert.expires))}</p>${alert.instruction ? `<p><strong>Indicación del organismo:</strong> ${escapeHtml(alert.instruction)}</p>` : ''}<p><a href="${escapeHtml(alert.sourceUrl)}">Abrir alerta oficial</a></p></article>`).join('')}</section>
  <section><h2>Paraná y Salado</h2><p><strong>Vigencia general:</strong> ${escapeHtml(freshness(snapshot))}</p>${systems.length ? systems.map((system) => `<article><h3>${escapeHtml(system.label)}</h3><div class="facts"><div><small>Nivel actual</small><br><strong>${system.available && system.currentMetres !== null ? `${system.currentMetres.toFixed(2).replace('.', ',')} m` : 'No disponible'}</strong></div><div><small>Observada</small><br>${escapeHtml(formatLocalDateTime(system.observedAt))}</div><div><small>Recibida</small><br>${escapeHtml(formatLocalDateTime(system.fetchedAt))}</div><div><small>Vigencia</small><br>${escapeHtml(systemFreshness(system.freshness))}</div></div><p><small>Fuente: ${escapeHtml(system.sourceName)}</small></p></article>`).join('') : '<p>No hay estaciones con una lectura utilizable.</p>'}<p><small>Una cifra o un umbral aislado no constituye una orden oficial.</small></p></section>
  <section><h2>Si necesitás actuar</h2><p>${escapeHtml(snapshot.recommendedAction)}</p><p class="warning"><strong>Un reporte no inicia un despacho de emergencia.</strong> Ante peligro inmediato llamá al servicio correspondiente.</p><div class="contacts">${contacts.map(([number,label]) => `<a href="tel:${number}"><strong>${number}</strong><span>${escapeHtml(label)}</span></a>`).join('')}</div></section>
  <section><h2>De dónde salen los datos</h2><table><thead><tr><th>Organismo / feed</th><th>Estado</th><th>Observado</th></tr></thead><tbody>${snapshot.sources.map((source) => `<tr><td>${escapeHtml(source.organizationName ?? source.name)}<br><small>${escapeHtml(source.feedName ?? source.name)}</small></td><td>${escapeHtml(sourceAvailability(source.classification))}</td><td>${escapeHtml(formatLocalDateTime(source.observedAt))}</td></tr>`).join('')}</tbody></table></section>
  </main><footer><p>${escapeHtml(snapshot.emergencyDisclaimer)}</p><p><a href="/">Volver a la versión completa</a> · <a href="/api/health">Estado técnico</a></p></footer></body></html>`;
  return withSecurityHeaders(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
}
