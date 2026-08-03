export interface ProvenanceRecord {
  readonly sourceId: string;
  readonly evidenceRefs: readonly string[];
  readonly capturedAt: string;
  readonly commitment: string | null;
}

export function freezeProvenance(record: ProvenanceRecord): ProvenanceRecord {
  if (!record.sourceId || !Number.isFinite(Date.parse(record.capturedAt))) throw new TypeError('provenance inválida');
  return Object.freeze({ ...record, evidenceRefs: Object.freeze([...record.evidenceRefs]) });
}
