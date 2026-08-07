import type { PublicState } from './snapshot.ts';

export interface StateSignals {
  readonly modelRisk: 'NORMAL' | 'ELEVATED' | 'HIGH' | 'UNKNOWN';
  readonly riverTrend: 'RISING_SLOWLY' | 'RISING' | 'STABLE' | 'FALLING' | 'UNKNOWN';
  readonly officialAlert: 'NONE' | 'WATCH' | 'ALERT' | 'EVACUATION' | 'UNKNOWN';
  readonly observationAvailable: boolean;
}

export interface StateDecision {
  readonly state: PublicState;
  readonly contradictions: readonly string[];
  readonly reason: string;
}

export function derivePublicState(signals: StateSignals): StateDecision {
  if (signals.officialAlert === 'EVACUATION') {
    return { state: 'EVACUACION_OFICIAL', contradictions: [], reason: 'Existe una comunicación oficial de evacuación vigente.' };
  }
  if (signals.officialAlert === 'ALERT') {
    return { state: 'ALERTA', contradictions: [], reason: 'Existe una alerta oficial vigente.' };
  }
  if (signals.officialAlert === 'UNKNOWN' || !signals.observationAvailable) {
    return { state: 'UNKNOWN', contradictions: ['No se puede confirmar el estado de todas las fuentes críticas.'], reason: 'Faltan observaciones o confirmación oficial suficiente.' };
  }

  const contradictions: string[] = [];
  if ((signals.modelRisk === 'ELEVATED' || signals.modelRisk === 'HIGH') && signals.officialAlert === 'NONE') {
    contradictions.push('El modelo marca riesgo elevado, pero no hay alerta oficial activa.');
  }
  if ((signals.riverTrend === 'RISING' || signals.riverTrend === 'RISING_SLOWLY') && signals.officialAlert === 'NONE') {
    contradictions.push('La observación asciende, sin umbral extraordinario ni alerta oficial confirmada.');
  }
  if (contradictions.length > 0 || signals.officialAlert === 'WATCH') {
    return { state: 'VIGILANCIA', contradictions, reason: 'Hay señales que merecen seguimiento, sin base para emitir una orden de evacuación.' };
  }
  return { state: 'NORMAL', contradictions: [], reason: 'Las fuentes disponibles no muestran una señal extraordinaria.' };
}
