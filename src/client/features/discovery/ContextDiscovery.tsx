import { CivicCampaignBanner, CivicQuickAccessGrid } from '../../components/civic/CivicSystem.tsx';

export function ContextDiscovery() {
  return <section className="civic-discovery context-discovery" aria-labelledby="context-discovery-title">
    <header className="civic-section-title">
      <div><p className="section-kicker">Para entender mejor</p><h2 id="context-discovery-title">Tres claves antes de comparar números</h2></div>
      <span>Santa Fe · lectura responsable</span>
    </header>
    <div className="context-discovery__principles">
      <article><strong>Cada estación tiene su propia escala</strong><p>Los metros de Paraná y Salado no se comparan como si compartieran el mismo cero.</p></article>
      <article><strong>Medición y consulta son tiempos distintos</strong><p>Una fuente recién consultada puede contener una medición vieja. SOS-SF muestra ambas edades por separado.</p></article>
      <article><strong>Una referencia no es una orden</strong><p>Los umbrales ayudan a interpretar la lectura; una orden oficial sólo existe cuando la publica la autoridad competente.</p></article>
    </div>
    <CivicQuickAccessGrid/>
    <CivicCampaignBanner compact/>
  </section>;
}
