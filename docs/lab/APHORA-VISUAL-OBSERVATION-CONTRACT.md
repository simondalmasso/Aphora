# APHORA Visual Observation Contract

Status: future-facing interface only. RF-DETR is architectural inspiration and is not a production dependency in ORDER-032.

## Purpose

A visual detector may eventually normalize external imagery into a structured observation that APHORA can rank spatially without confusing machine inference with an official warning. This contract has zero runtime dependency in ORDER-032: no model download, inference service, Python process, commercial vision API, or production CV path is introduced.

## Normalized supplementary visual observation

Required unless marked optional:

- `provider`: producer or integration identifier.
- `model`: model family or detector name.
- `modelVersion`: immutable model/version identifier.
- `observationType`: controlled observation class, for example `water_extent`, `smoke`, `fire`, `flooded_road`, or `debris`.
- `geometry`: GeoJSON geometry derived from the visual evidence when georeferencing is supported; null when it is not.
- `geometryPrecision` (optional): explicit precision/provenance qualifier.
- `confidence`: bounded model confidence with documented semantics; confidence is not severity.
- `observedAt`: timestamp represented by the source media when known; null when unknown.
- `processedAt`: inference/normalization timestamp.
- `sourceMediaUrl` (optional): inspectable source media URL when publication/licensing permits it.
- `sourceMediaReference` (optional): durable reference when the source media itself cannot be exposed. At least one sourceMediaUrl/reference mechanism is required.
- `sourceRole`: MUST equal `SUPPLEMENTARY_EXTERNAL_OBSERVATION`.
- `verificationState`: machine/source verification state, never a public-safety conclusion.
- `provenance`: structured origin, acquisition, transformation, georeferencing and model lineage.
- `metadata` (optional): detector-specific bounded metadata that does not change evidence role.

Unknown values remain null or omitted. Unknown is never converted to zero. Missing geometry produces no distance.

## Evidence-role law

A normalized visual observation MUST NOT become `OFFICIAL_WARNING` automatically. It remains `SUPPLEMENTARY_EXTERNAL_OBSERVATION` unless a separate authoritative source provides an official warning as its own canonical evidence record.

The visual inference MUST NOT fabricate `severity`, `impact`, or `recommendedActions`. Those fields may only enter APHORA from a source contract that is semantically authorized to provide them. Confidence is a detector property, not civic-risk severity.

## Geometry and proximity

When source media is georeferenced, geometry must carry explicit provenance and precision. APHORA may compute proximity from that geometry using the same bounded proximity layer used for other evidence. A detector must not invent a coverage polygon, flood extent, road blockage footprint, or exact point when the source does not support it.

## Example shape

```json
{
  "provider": "future-visual-provider",
  "model": "rfdetr-compatible-detector",
  "modelVersion": "immutable-version",
  "observationType": "flooded_road",
  "geometry": null,
  "geometryPrecision": null,
  "confidence": 0.87,
  "observedAt": null,
  "processedAt": "ISO-8601",
  "sourceMediaReference": "opaque-reference",
  "sourceRole": "SUPPLEMENTARY_EXTERNAL_OBSERVATION",
  "verificationState": "MODEL_OUTPUT_UNCORROBORATED",
  "provenance": {
    "source": "external-media",
    "georeferencing": "unavailable"
  }
}
```

## ORDER-032 non-goals

There is no RF-DETR production runtime, no GPU runtime, no Python runtime dependency, no Roboflow dependency, no Cloudflare inference addition, no paid API, and no automatic promotion of model output into alerts. This document only fixes the future evidence boundary.
