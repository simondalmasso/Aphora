import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePrefecturaHtml,prefecturaObservationsFromHtml} from '../src/providers/prefectura-observations.js';

const html=`<!doctype html><table><thead><tr><th>Puerto</th><th>Río</th><th>Ult. registro</th><th>Variación</th><th>Periodo</th><th>Fecha Hora</th><th>Estado</th><th></th><th>Registro Anterior</th><th>Fecha Anterior</th><th>Alerta</th><th>Evacuación</th><th>Hist.</th></tr></thead><tbody>
<tr><td>SANTA FE</td><td>PARANA</td><td>3.56</td><td>0.00</td><td>2</td><td>13/OCT/26 - 1200</td><td>ESTAC.</td><td><img src="estado.png"></td><td>3.56</td><td>13/OCT/26 - 1000</td><td>5.30</td><td>5.70</td><td><a href="/hist/santa-fe">Hist.</a></td></tr>
<tr><td>IGUAZU</td><td>IGUAZU</td><td>29.20</td><td>0.55</td><td>4</td><td>13/OCT/26 - 1000</td><td>EVACUACION CRECE</td><td></td><td>28.65</td><td>13/OCT/26 - 0600</td><td>25.00</td><td>28.00</td><td></td></tr>
<tr><td>REPRESA ITAIPU (BRASIL)</td><td>PARANA</td><td>173.18</td><td>23.68</td><td>24</td><td>12/OCT/26 - 0900</td><td>CRECE</td><td></td><td>149.50</td><td>11/OCT/26 - 0900</td><td>-</td><td>-</td><td></td></tr>
<tr><td>BOUVIER</td><td>PARAGUAY</td><td>S/E</td><td>-</td><td>2</td><td>13/OCT/26 - 1200</td><td>S/E.</td><td></td><td>S/E</td><td>13/OCT/26 - 1000</td><td>6.00</td><td>6.40</td><td></td></tr>
</tbody></table>`;

test('PREFECTURA_HTML_PRESERVES_MEASUREMENT_THRESHOLDS_STATUS_AND_SOURCE_TIME',()=>{
 const rows=normalizePrefecturaHtml(html,{now:Date.parse('2026-10-13T15:10:00.000Z')});
 assert.equal(rows.length,3);
 const santaFe=rows.find(x=>x.port==='SANTA FE');
 assert.equal(santaFe.value,3.56);
 assert.equal(santaFe.delta,0);
 assert.equal(santaFe.alertLevel,5.3);
 assert.equal(santaFe.evacuationLevel,5.7);
 assert.equal(santaFe.officialStatus,'ESTAC.');
 assert.equal(santaFe.observedAt,'2026-10-13T15:00:00.000Z');
 assert.equal(santaFe.unit,'m');
 assert.equal(santaFe.ageMinutes,10);
});

test('PREFECTURA_BRAZIL_ADMINISTRATION_ROWS_ARE_EXCLUDED_FROM_ARGENTINE_METRE_SERIES',()=>{
 const rows=normalizePrefecturaHtml(html,{now:Date.parse('2026-10-13T15:10:00.000Z')});
 assert.equal(rows.some(x=>x.port.includes('BRASIL')),false);
});

test('PREFECTURA_NO_MEASUREMENT_NEVER_BECOMES_ZERO_OR_AN_ALERT',()=>{
 const [row]=normalizePrefecturaHtml(html,{now:Date.parse('2026-10-13T15:10:00.000Z')}).filter(x=>x.port==='BOUVIER');
 assert.equal(row.value,null);
 assert.equal(row.verificationState,'UNAVAILABLE');
 const obs=prefecturaObservationsFromHtml(html,{now:Date.parse('2026-10-13T15:10:00.000Z')}).find(x=>x.locationLabel==='BOUVIER');
 assert.equal(obs.value,null);
 assert.equal(obs.isWarning,false);
 assert.equal(obs.severity,undefined);
});

test('PREFECTURA_STATUS_IS_SOURCE_STATUS_NOT_AN_APHORA_WARNING',()=>{
 const obs=prefecturaObservationsFromHtml(html,{now:Date.parse('2026-10-13T15:10:00.000Z')}).find(x=>x.locationLabel==='IGUAZU');
 assert.equal(obs.officialStatus,'EVACUACION CRECE');
 assert.equal(obs.isWarning,false);
 assert.equal(obs.sourceRole,'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION');
 assert.equal(obs.metadata.thresholdPosition,'AT_OR_ABOVE_EVACUATION_THRESHOLD');
 assert.equal(obs.metadata.statusSemantics,'PREFECTURA_PUBLISHED_STATION_STATUS_NOT_NATIONAL_ALERT');
});

test('PREFECTURA_STATION_GEOMETRY_ONLY_MATCHES_EXACT_STATION_AND_RIVER_METADATA',()=>{
 const metadata=[{stationName:'Santa Fe',riverName:'Río Paraná',geometry:{type:'Point',coordinates:[-60.684,-31.659]},coordinateSource:'INA_SIYAH_SERIES_GEOJSON',coordinatePrecision:'PROVIDER_PUBLISHED_UNVALIDATED'}];
 const obs=prefecturaObservationsFromHtml(html,{metadata,now:Date.parse('2026-10-13T15:10:00.000Z')}).find(x=>x.locationLabel==='SANTA FE');
 assert.deepEqual(obs.geometry.coordinates,[-60.684,-31.659]);
 assert.equal(obs.metadata.coordinateSource,'INA_SIYAH_SERIES_GEOJSON_MATCHED_BY_STATION_AND_RIVER');
 const unmatched=prefecturaObservationsFromHtml(html,{metadata,now:Date.parse('2026-10-13T15:10:00.000Z')}).find(x=>x.locationLabel==='IGUAZU');
 assert.equal(unmatched.geometry,null);
 assert.equal(unmatched.metadata.geolocationState,'UNRESOLVED');
});
