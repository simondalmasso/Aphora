import type { Snapshot } from '../domain/snapshot';
import { sourceAgeLabel } from '../domain/sources';
import { withSecurityHeaders } from './security';

interface Contact { readonly label: string; readonly number: string; readonly href: string }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function list(items: readonly string[]): string {
  return items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>Sin información disponible.</p>';
}

function statusLabel(snapshot: Snapshot): string {
  if (snapshot.mode === 'OFFLINE' || snapshot.dataStatus === 'OFFLINE') return 'Modo sin conexión';
  if (snapshot.dataStatus === 'STALE') return 'Datos desactualizados';
  if (snapshot.dataStatus === 'LIVE') return 'Datos en vivo';
  return 'Sin datos en vivo';
}

function usableTimestamp(value: string | null | undefined): string | null {
  if (!value || !Number.isFinite(Date.parse(value)) || Date.parse(value) <= 0) return null;
  return new Date(value).toISOString();
}

function ageLabel(value: string | null | undefined, generatedAt: string): string {
  const timestamp = usableTimestamp(value);
  return timestamp ? sourceAgeLabel(timestamp, generatedAt) : 'sin timestamp';
}

export function liteResponse(snapshot: Snapshot, contacts: readonly Contact[]): Response {
  const systems = snapshot.systems ?? [];
  const primaryObservedAt = snapshot.river.available === false ? null : usableTimestamp(snapshot.river.observedAt);
  const html = `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SOS Santa Fe Lite — estado hídrico</title><link rel="stylesheet" href="/lite.css"></head>
<body><header><a href="/">SOS Santa Fe</a><strong>${escapeHtml(statusLabel(snapshot))}</strong></header>
<main>
<h1>Estado hídrico de Santa Fe</h1><p><strong>${escapeHtml(snapshot.stateLabel)}</strong></p>
<p>${escapeHtml(snapshot.summary)}</p>
<p><strong>Recomendaciones operativas:</strong> ${escapeHtml(snapshot.recommendedAction)}</p>
<p class="time">Generado: <time datetime="${snapshot.generatedAt}">${escapeHtml(snapshot.generatedAt)}</time>. Observación principal: ${primaryObservedAt ? `<time datetime="${primaryObservedAt}">${escapeHtml(primaryObservedAt)}</time>` : 'sin timestamp'}. Fuente principal: ${escapeHtml(snapshot.river.sourceName ?? snapshot.river.sourceId)}.</p>
<section><h2>Sistemas y estaciones</h2>${systems.length ? systems.map((system) => `<article><h3>${escapeHtml(system.label)} · ${escapeHtml(system.stationName)}</h3><p>${system.available && system.currentMetres !== null ? `<strong>${system.currentMetres.toFixed(2)} m</strong> · ${escapeHtml(system.trend)}` : '<strong>Sin datos en vivo</strong>'}</p><small>${escapeHtml(system.sourceName)} · ${system.observedAt ? escapeHtml(sourceAgeLabel(system.observedAt, snapshot.generatedAt)) : 'sin timestamp'} · lectura publicada sin validación definitiva salvo marca expresa</small></article>`).join('') : '<p>Sin estaciones con lectura publicada disponible.</p>'}</section>
<section><h2>Fuentes</h2>${list(snapshot.sources.map((source) => `${source.name} — ${source.status} — ${source.connected ? 'conectada e interpretada' : 'sin payload utilizable'} — ${ageLabel(source.observedAt, snapshot.generatedAt)} — ${source.contribution}${source.qualityNote ? ` — Calidad: ${source.qualityNote}` : ''}${source.uncertainty ? ` — Incertidumbre: ${source.uncertainty}` : ''}`))}</section>
<section><h2>Teléfonos esenciales</h2><ul>${contacts.map((contact) => `<li><a href="${escapeHtml(contact.href)}">${escapeHtml(contact.number)} — ${escapeHtml(contact.label)}</a></li>`).join('')}</ul></section>
<section><h2>Acciones recomendadas</h2>${list(snapshot.actions)}</section>
</main><footer><p>${escapeHtml(snapshot.emergencyDisclaimer)}</p><p>Un umbral numérico no constituye una orden oficial. Esta pantalla no necesita JavaScript y queda disponible después de una visita exitosa.</p></footer></body></html>`;
  return withSecurityHeaders(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
}
