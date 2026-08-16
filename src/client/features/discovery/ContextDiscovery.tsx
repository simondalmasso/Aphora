import { CivicCampaignBanner, CivicQuickAccessGrid } from '../../components/civic/CivicSystem.tsx';

export function ContextDiscovery() {
  return <section className="civic-discovery context-discovery context-discovery--product" aria-labelledby="context-discovery-title">
    <h2 id="context-discovery-title" className="sr-only">Cómo leer estos datos</h2>
    <details>
      <summary><span>Cómo leer estos datos</span><small>3 claves</small></summary>
      <div className="context-discovery__principles">
        <article><strong>Escalas distintas</strong><p>Paraná y Salado no comparten el mismo cero.</p></article>
        <article><strong>Dos tiempos</strong><p>Medición y consulta de la fuente no son lo mismo.</p></article>
        <article><strong>Referencia ≠ orden</strong><p>Una orden sólo existe cuando la publica la autoridad competente.</p></article>
      </div>
    </details>
    <CivicQuickAccessGrid/>
    <CivicCampaignBanner compact/>
  </section>;
}
