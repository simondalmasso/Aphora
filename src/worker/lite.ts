import { demoSnapshot } from '../data/demo-snapshot';
import { sourceAgeLabel } from '../domain/sources';
import { visibleMessages } from '../domain/messages';
import { withSecurityHeaders } from './security';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function list(items: readonly string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

export function liteResponse(): Response {
  const snapshot = demoSnapshot;
  const messages = visibleMessages(snapshot.messages, new Date(snapshot.generatedAt));
  const html = `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SOS Santa Fe Lite — DEMO / NO OFICIAL</title><link rel="stylesheet" href="/lite.css"></head>
<body><header><a href="/">SOS Santa Fe</a><strong>DEMO / NO OFICIAL</strong></header>
<main>
<h1>${escapeHtml(snapshot.stateLabel)}</h1><p><strong>Estado: ${snapshot.state}</strong></p>
<p>${escapeHtml(snapshot.summary)}</p>
<p><strong>Qué hacer ahora:</strong> ${escapeHtml(snapshot.recommendedAction)}</p>
<p class="time">Snapshot fijo: <time datetime="${snapshot.generatedAt}">${escapeHtml(snapshot.generatedAt)}</time>. Vigente sólo dentro del escenario hasta ${escapeHtml(snapshot.validUntil)}.</p>
<section><h2>Qué cambió</h2>${list(snapshot.changes.map((change) => `${change.label}: ${change.detail}`))}</section>
<section><h2>Río y lluvia</h2><p>Nivel demo: <strong>${snapshot.river.currentMetres.toFixed(2)} m</strong> · tendencia ascendente lenta · ${snapshot.river.delta1h >= 0 ? '+' : ''}${Math.round(snapshot.river.delta1h * 100)} cm/1 h.</p><p>Lluvia demo: <strong>${snapshot.rain.accumulated1hMm.toFixed(1)} mm/1 h</strong> · ${snapshot.rain.accumulated24hMm.toFixed(1)} mm/24 h.</p></section>
<section><h2>Contradicciones</h2>${snapshot.contradictions.map((item) => `<h3>${escapeHtml(item.title)}</h3>${list(item.signals)}<p>${escapeHtml(item.explanation)}</p>`).join('')}</section>
<section><h2>Fuentes demo</h2>${list(snapshot.sources.map((source) => `${source.name} — ${source.status} — ${sourceAgeLabel(source.observedAt, snapshot.generatedAt)} — ${source.contribution}`))}</section>
<section><h2>Comunicaciones críticas</h2>${messages.map((message) => `<article><h3>${escapeHtml(message.title)}</h3><p>${escapeHtml(message.body)}</p><small>Prioridad ${message.priority} · vence ${escapeHtml(message.expiresAt)} · ${escapeHtml(message.sourceId)}</small></article>`).join('')}</section>
<section><h2>Refugios y puntos</h2><p><strong>Ningún refugio activo.</strong> Las ubicaciones son ficticias.</p>${list(snapshot.shelters.map((shelter) => `${shelter.name}: ${shelter.status} — ${shelter.address}`))}</section>
<section><h2>Acciones recomendadas</h2>${list(snapshot.actions)}</section>
</main><footer><p>${escapeHtml(snapshot.emergencyDisclaimer)}</p><p>Esta pantalla no necesita JavaScript.</p></footer></body></html>`;
  return withSecurityHeaders(new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  }));
}
