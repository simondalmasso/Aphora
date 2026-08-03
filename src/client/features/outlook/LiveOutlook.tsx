import type { Snapshot } from '../../../domain/snapshot';
import { SafeLevelGauge } from '../../components/ui/SafeLevelGauge';

export function LiveOutlook({ snapshot }: { readonly snapshot: Snapshot }) {
  const systems = snapshot.systems ?? [];
  return <section className="v3-card outlook-card" aria-labelledby="live-outlook-title" data-primary-section="true"><header className="v3-card__header"><div><span className="v3-eyebrow">Umbrales por estación</span><h2 id="live-outlook-title">Evolución prevista</h2></div><span className="outlook-window">24 h</span></header><div className="outlook-systems">{systems.map((system) => <article className="outlook-system" key={system.id}><div><h3>{system.label}</h3><p>{system.watercourse} · {system.stationName}</p></div><SafeLevelGauge available={system.available} currentMetres={system.currentMetres} thresholds={system.thresholds} stateLabel={system.available ? snapshot.stateLabel : 'Sin datos en vivo'}/><p>{system.available ? 'No existe una proyección de 24 horas validada para esta estación en el snapshot actual. Se muestran sólo observaciones y umbrales propios.' : 'Sin una lectura validada no se calcula margen ni tendencia.'}</p></article>)}{systems.length === 0 && <p>Sin sistemas disponibles.</p>}</div></section>;
}
