export interface EssentialContact {
  readonly id: string;
  readonly label: string;
  readonly number: string;
  readonly href: string;
  readonly purpose: string;
}

export const ESSENTIAL_CONTACTS: readonly EssentialContact[] = Object.freeze([
  Object.freeze({ id: 'emergency-911', label: 'Emergencias', number: '911', href: 'tel:911', purpose: 'Peligro inmediato' }),
  Object.freeze({ id: 'civil-protection-103', label: 'COBEM / Protección Civil', number: '103', href: 'tel:103', purpose: 'Asistencia y coordinación local' }),
  Object.freeze({ id: 'medical-107', label: 'Emergencias médicas', number: '107', href: 'tel:107', purpose: 'Urgencia médica' }),
]);
