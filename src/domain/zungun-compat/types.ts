export type CriticalMessageType = 'OFFICIAL_NOTICE' | 'WEATHER_WARNING' | 'SHELTER_UPDATE' | 'SOURCE_CONTRADICTION' | 'SYSTEM_STATUS' | 'COMMUNITY_VERIFIED_REPORT';
export type CriticalMessageStatus = 'ACTIVE' | 'EXPIRED' | 'RETRACTED' | 'UNKNOWN';

export interface CriticalMessage {
  readonly id: string;
  readonly type: CriticalMessageType;
  readonly title: string;
  readonly body: string;
  readonly sourceId: string;
  readonly geographicScope: readonly string[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly priority: 0 | 1 | 2 | 3;
  readonly status: CriticalMessageStatus;
  readonly evidenceRefs: readonly string[];
  readonly commitment?: string;
  readonly provenance: {
    readonly producer: string;
    readonly sourceKind: string;
    readonly capturedAt: string;
  };
}

export interface ZungunEnvelopeSubset {
  readonly messageId: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly priority: 0 | 1 | 2 | 3;
  readonly contentType: 'application/vnd.sos-sf.critical-message+json';
  readonly messageCommitment: string;
  readonly status: 'QUEUED' | 'ELIGIBLE' | 'SENDING' | 'ACCEPTED' | 'TEMPORARILY_UNAVAILABLE' | 'UNKNOWN' | 'ACKNOWLEDGED' | 'PERMANENTLY_REJECTED' | 'EXPIRED' | 'FAILED';
}
