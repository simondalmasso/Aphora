import { demoSnapshot } from './demo-snapshot.ts';

export const sourceRegistry = Object.freeze(
  Object.fromEntries(demoSnapshot.sources.map((source) => [source.id, source])),
);
