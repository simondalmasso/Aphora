import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/app.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('APHORA desktop dashboard has a real sidebar and responsive dashboard columns', () => {
  assert.match(html, /class="desktop-sidebar"/);
  assert.match(html, /id="desktop-map-column"/);
  assert.match(html, /id="river-feature"/);
  assert.match(css, /\.desktop-sidebar/);
  assert.match(css, /\.app-shell\[data-view="now"\]/);
});

test('desktop map is visible on home and remains lazy on mobile until map is selected', () => {
  assert.match(app, /homeMap=v===\x27now\x27&&desktop/);
  assert.match(app, /matchMedia\(['"]\(min-width:\s*900px\)['"]\)/);
  assert.match(app, /renderRiverFeature/);
  assert.match(app, /\.desktop-sidebar \[data-sidebar-action\]/);
});

test('dashboard does not invent river values or advertise AI features', () => {
  assert.match(html, /Entender qué pasa\. Saber qué hacer\./);
  assert.doesNotMatch(html + app + css, /5,23 m|12 cm|generado por IA|inteligencia artificial|asistente IA|powered by AI|AI assistant|GPT/i);
  assert.match(app, /Sin medición verificable/);
  assert.match(app, /No se interpreta como ausencia de riesgo/);
});
test('resources panel exposes distinct, safe external reference links', () => {
  assert.match(html, /id="resources-panel"/);
  assert.match(html, /href="https:\/\/cotacerosf\.com\/"/);
  assert.match(html, /href="https:\/\/www\.smn\.gob\.ar\/"/);
  assert.match(html, /href="https:\/\/www\.ina\.gob\.ar\/"/);
  assert.match(html, /href="https:\/\/www\.argentina\.gob\.ar\/prefecturanaval"/);
  assert.match(html, /href="https:\/\/www\.inpres\.gob\.ar\/"/);
  assert.equal((html.match(/id="source-pulse-panel"/g) || []).length, 1);
  assert.doesNotMatch(html, /id="source-pulse-panel"<section/);
});