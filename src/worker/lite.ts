import type { Snapshot } from '../domain/snapshot';
import { formatLocalDateTime } from '../domain/public-safety';
import { withSecurityHeaders } from './security';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

function alertHeading(snapshot: Snapshot): string {
  if (snapshot.alertStatus === 'ALERTA_OFICIAL_ACTIVA') return 'Alerta oficial activa';
  if (snapshot.alertStatus === 'SIN_ALERTAS_OFICIALES_DETECTADAS') return 'Sin alertas oficiales detectadas';
  if (snapshot.alertStatus === 'VERIFICACION_DE_ALERTAS_DEGRADADA') return 'Verificación de alertas demorada';
  return 'Fuentes de alertas no disponibles';
}

function freshness(snapshot: Snapshot): string {
  if (snapshot.mode === 'OFFLINE') return 'Sin conexión';
  if (snapshot.freshness === 'ACTUALIZADO') return 'Actualizado';
  if (snapshot.freshness === 'ACTUALIZACION_DEMORADA') return 'Actualización demorada';
  if (snapshot.freshness === 'DESACTUALIZADO') return 'Desactualizado';
  return 'No disponible';
}

export function liteResponse(snapshot: Snapshot): Response {
  const systems = snapshot.systems ?? [];
  const alerts = (snapshot.alerts ?? []).filter((alert) => alert.appliesToSantaFe && (alert.lifecycle === 'ACTIVE' || alert.lifecycle === 'UPDATED'));
  const contacts = [
    ['911', 'Emergencias'], ['103', 'COBEM'], ['107', 'Emergencias médicas'], ['100', 'Bomberos'], ['106', 'Emergencias náuticas'],
  ];
  const html = `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>SOS Santa Fe — modo lite</title><style>
  :root{font-family:system-ui,sans-serif;color:#17212b;background:#f4f6f8;line-height:1.55}*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:760px;margin:auto;padding:18px}header{background:#fff;border-bottom:4px solid #174f78}h1,h2,h3{color:#102a43;line-height:1.2}section{background:#fff;border:1px solid #cbd5df;padding:16px;margin:14px 0}.alert{border-top:6px solid #236a99}.alert.critical{border-top-color:#b3261e;background:#fff0ef}.alert.attention{border-top-color:#f5c542}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}.facts div{padding:9px;background:#f2f7fa}.contacts{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}.contacts a{display:grid;padding:12px;border:1px solid #236a99;text-decoration:none;text-align:center}small{color:#586674}.warning{border-left:4px solid #b3261e;padding:10px;background:#fff0ef}a{color:#174f78}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5df;padding:8px;text-align:left}@media(max-width:420px){header,main,footer{padding:12px}}
  </style></head><body><header><strong>SOS Santa Fe</strong><h1>Información pública para emergencias</h1><p>Servicio independiente que integra y organiza fuentes públicas oficiales.</p></header><main>
  <section class="alert ${snapshot.alertStatus === 'ALERTA_OFICIAL_ACTIVA' ? 'critical' : snapshot.alertStatus === 'SIN_ALERTAS_OFICIALES_DETECTADAS' ? '' : 'attention'}"><h2>${escapeHtml(alertHeading(snapshot))}</h2><p>${escapeHtml(snapshot.recommendedAction)}</p><p><strong>Última actualización del integrador:</strong> ${escapeHtml(formatLocalDateTime(snapshot.generatedAt))}</p>${alerts.map((alert) => `<article><h3>${escapeHtml(alert.headline)}</h3><p><strong>Área:</strong> ${escapeHtml(alert.area)}</p><p><strong>Emitida:</strong> ${escapeHtml(formatLocalDateTime(alert.sent))} · <strong>Válida hasta:</strong> ${escapeHtml(formatLocalDateTime(alert.expires))}</p>${alert.instruction ? `<p><strong>Instrucción del organismo:</strong> ${escapeHtml(alert.instruction)}</p>` : ''}<p><a href="${escapeHtml(alert.sourceUrl)}">Ver aviso oficial</a></p></article>`).join('')}</section>
  <section><h2>Situación hidrométrica</h2><p><strong>Vigencia general:</strong> ${escapeHtml(freshness(snapshot))}</p>${systems.length ? systems.map((system) => `<article><h3>${escapeHtml(system.label)}</h3><div class="facts"><div><small>Última medición</small><br><strong>${system.available && system.currentMetres !== null ? `${system.currentMetres.toFixed(2).replace('.', ',')} m` : 'No disponible'}</strong></div><div><small>Observado</small><br>${escapeHtml(formatLocalDateTime(system.observedAt))}</div><div><small>Recibido</small><br>${escapeHtml(formatLocalDateTime(system.fetchedAt))}</div><div><small>Vigencia</small><br>${escapeHtml(system.freshness ?? 'NO_DISPONIBLE')}</div></div><p>Fuente: ${escapeHtml(system.sourceName)}</p></article>`).join('') : '<p>No hay estaciones con una lectura utilizable.</p>'}</section>
  <section><h2>Qué hacer ahora</h2><p>${escapeHtml(snapshot.recommendedAction)}</p><p class="warning"><strong>Reportar una situación no inicia un despacho de emergencia.</strong> Ante peligro inmediato llamá al servicio correspondiente.</p><div class="contacts">${contacts.map(([number,label]) => `<a href="tel:${number}"><strong>${number}</strong><span>${escapeHtml(label)}</span></a>`).join('')}</div></section>
  <section><h2>Fuentes y actualización</h2><table><thead><tr><th>Organismo / feed</th><th>Estado</th><th>Observado</th></tr></thead><tbody>${snapshot.sources.map((source) => `<tr><td>${escapeHtml(source.organizationName ?? source.name)}<br><small>${escapeHtml(source.feedName ?? source.name)}</small></td><td>${escapeHtml(source.classification ?? 'DEGRADED')}</td><td>${escapeHtml(formatLocalDateTime(source.observedAt))}</td></tr>`).join('')}</tbody></table></section>
  </main><footer><p>${escapeHtml(snapshot.emergencyDisclaimer)}</p><p><a href="/">Versión completa</a> · <a href="/api/health">Estado técnico</a></p></footer></body></html>`;
  return withSecurityHeaders(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
}
