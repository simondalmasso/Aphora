# SOS-SF 019 — implementation checkpoint notes

## Scope

- Product source: React + TypeScript + Vite.
- Runtime and public data contracts preserved.
- No `main` write.
- No R2.
- D1 Free and KV Free remain untouched.
- One temporary Actions workflow performs verification, one Workers deploy, remote GET verification, evidence publication and self-disarm.

## Removed visual debt

The previous stylesheet contained the original dashboard plus two appended correction layers. `app.css` is replaced by one consolidated system. Obsolete page-level compositions are no longer rendered.

## Risk controls

- A failed alert feed never precedes hydrometry.
- A verified active official alert is the only alert state permitted above hydrometry.
- Stale station values remain visible with explicit age and freshness.
- Supplementary sources are not labelled as local official observations.
- Threshold lines are references, not evacuation instructions.
- Report submission remains secondary and collapsed.
