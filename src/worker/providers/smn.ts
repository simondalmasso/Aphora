import { fetchProvider, type ProviderPolicy, type ProviderResult } from './core';

export interface SmnObservationSummary {
  readonly observedAt: string;
  readonly station: string | null;
  readonly precipitationMm: number | null;
}

export interface SmnAlertSummary {
  readonly identifier: string;
  readonly sender: string;
  readonly sent: string;
  readonly status: string;
  readonly messageType: string;
  readonly scope: string;
  readonly category: string;
  readonly event: string;
  readonly urgency: string;
  readonly severity: string;
  readonly certainty: string;
  readonly effective: string | null;
  readonly onset: string | null;
  readonly expires: string | null;
  readonly headline: string;
  readonly description: string;
  readonly instruction: string;
  readonly area: string;
  readonly sourceUrl: string;
  readonly lifecycle: 'ACTIVE' | 'UPDATED' | 'CANCELLED' | 'EXPIRED' | 'UNKNOWN';
  readonly appliesToSantaFe: boolean;
}

const CAP: ProviderPolicy = Object.freeze({
  id: 'smn-alerts',
  hosts: Object.freeze(['ssl.smn.gob.ar']),
  paths: Object.freeze([/^\/feeds\/CAP\/rss_alertaCAP_nuevo_\d{4}\.xml$/]),
  contentTypes: Object.freeze(['application/xml', 'text/xml', 'application/rss+xml']),
  maxBytes: 1_500_000,
  refreshMs: 5 * 60_000,
  freshMs: 30 * 60_000,
  staleMs: 12 * 60 * 60_000,
});

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, 'i'));
  return match?.[1] ? decode(match[1]) : null;
}

function firstDate(...values: (string | null)[]): string | null {
  for (const value of values) {
    if (value && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  }
  return null;
}

function lifecycle(title: string, messageType: string, expires: string | null, sent: string, now: Date): SmnAlertSummary['lifecycle'] {
  if (/cancel|cancelad|cesad|sin efecto|finaliz/i.test(`${title} ${messageType}`)) return 'CANCELLED';
  if (expires && Date.parse(expires) <= now.getTime()) return 'EXPIRED';
  if (!expires && now.getTime() - Date.parse(sent) > 12 * 60 * 60_000) return 'EXPIRED';
  if (/update|actualiz/i.test(messageType)) return 'UPDATED';
  if (expires || /alerta|advertencia|aviso/i.test(title)) return 'ACTIVE';
  return 'UNKNOWN';
}

function santaFeScope(...values: string[]): boolean {
  const combined = values.join(' ');
  return /(?:^|\b)(?:santa\s*fe|centro de santa fe|sur de santa fe|norte de santa fe|litoral)(?:\b|$)/i.test(combined);
}

export function fetchSmnAlerts(url: string): Promise<ProviderResult<readonly SmnAlertSummary[]>> {
  return fetchProvider(url, CAP, (body) => {
    if (!/<rss\b|<feed\b/i.test(body)) throw new Error('SMN_CAP_PARSE');
    const now = new Date();
    const output: SmnAlertSummary[] = [];
    const entries = [...body.matchAll(/<item\b[\s\S]*?<\/item>/gi), ...body.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)];
    for (const match of entries) {
      const xml = match[0];
      const headline = tag(xml, 'headline') ?? tag(xml, 'title');
      const sent = firstDate(tag(xml, 'sent'), tag(xml, 'pubDate'), tag(xml, 'updated'), tag(xml, 'published'));
      if (!headline || !sent) continue;
      const identifier = tag(xml, 'identifier') ?? tag(xml, 'guid') ?? `smn:${sent}:${headline.slice(0, 80)}`;
      const description = tag(xml, 'description') ?? tag(xml, 'summary') ?? '';
      const area = tag(xml, 'areaDesc') ?? tag(xml, 'area') ?? headline;
      const candidateUrl = tag(xml, 'link');
      const sourceUrl = candidateUrl && (() => { try { return new URL(candidateUrl).protocol === 'https:'; } catch { return false; } })() ? candidateUrl : url;
      const messageType = tag(xml, 'msgType') ?? tag(xml, 'messageType') ?? 'Alert';
      const expires = firstDate(tag(xml, 'expires'));
      const alertLifecycle = lifecycle(headline, messageType, expires, sent, now);
      output.push(Object.freeze({
        identifier: identifier.slice(0, 240),
        sender: (tag(xml, 'senderName') ?? tag(xml, 'sender') ?? 'Servicio Meteorológico Nacional').slice(0, 180),
        sent,
        status: (tag(xml, 'status') ?? 'Actual').slice(0, 80),
        messageType: messageType.slice(0, 80),
        scope: (tag(xml, 'scope') ?? 'Public').slice(0, 80),
        category: (tag(xml, 'category') ?? 'Met').slice(0, 80),
        event: (tag(xml, 'event') ?? headline).slice(0, 240),
        urgency: (tag(xml, 'urgency') ?? 'Unknown').slice(0, 80),
        severity: (tag(xml, 'severity') ?? 'Unknown').slice(0, 80),
        certainty: (tag(xml, 'certainty') ?? 'Unknown').slice(0, 80),
        effective: firstDate(tag(xml, 'effective')),
        onset: firstDate(tag(xml, 'onset')),
        expires,
        headline: headline.slice(0, 320),
        description: description.slice(0, 1600),
        instruction: (tag(xml, 'instruction') ?? '').slice(0, 1200),
        area: area.slice(0, 500),
        sourceUrl: sourceUrl.slice(0, 1000),
        lifecycle: alertLifecycle,
        appliesToSantaFe: santaFeScope(headline, description, area),
      }));
    }
    const channel = firstDate(tag(body, 'lastBuildDate'), tag(body, 'updated'));
    const observedAt = output.map((alert) => alert.sent).sort().at(-1) ?? channel;
    if (!observedAt) throw new Error('SMN_CAP_TIMESTAMP_MISSING');
    return { value: Object.freeze(output.slice(0, 100)), observedAt };
  });
}

export function fetchSmnObservations(url: string): Promise<ProviderResult<SmnObservationSummary>> {
  void url;
  return Promise.reject(new Error('SMN_OBSERVATIONS_CREDENTIAL_REQUIRED'));
}
