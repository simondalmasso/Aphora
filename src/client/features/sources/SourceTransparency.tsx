import type { RefObject } from 'react';
import type { Snapshot } from '../../../domain/snapshot';

export function SourceTransparency({ snapshot, sourcesButtonRef, onSources }: { readonly snapshot: Snapshot; readonly sourcesButtonRef: RefObject<HTMLButtonElement | null>; readonly onSources: (opener?: HTMLButtonElement | null) => void }) {
  const primaryOrganizations = (snapshot.sourceOrganizations ?? [])
    .filter((organization) => organization.official)
    .slice(0, 3)
    .map((organization) => organization.name);
  return <section className="source-access" aria-labelledby="sources-title">
    <div><p className="section-kicker">Transparencia</p><h2 id="sources-title">Datos y fuentes</h2><p>Observación, recepción y vigencia se muestran por separado. Fuentes principales: {primaryOrganizations.join(', ') || 'organismos públicos identificados'}.</p></div>
    <button ref={sourcesButtonRef} type="button" className="button button--secondary" onClick={(event) => onSources(event.currentTarget)}>Abrir Datos y fuentes</button>
  </section>;
}
