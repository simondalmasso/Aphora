import type { Snapshot } from '../../../domain/snapshot';
import { formatLocalDateTime } from '../../../domain/public-safety';

export function ServiceStatus({ snapshot }: { readonly snapshot: Snapshot }) {
  return <aside className="service-status" aria-labelledby="service-title"><div><p className="section-kicker">Estado técnico</p><h2 id="service-title">Estado del servicio</h2></div><dl><div><dt>API</dt><dd>{snapshot.serviceStatus?.api === 'OPERATIONAL' ? 'Operativa' : 'No disponible'}</dd></div><div><dt>Última verificación técnica</dt><dd>{formatLocalDateTime(snapshot.serviceStatus?.checkedAt ?? snapshot.generatedAt)}</dd></div></dl><p>{snapshot.serviceStatus?.note ?? 'El estado técnico no garantiza vigencia ni ausencia de peligro.'}</p></aside>;
}
