# SOS-SF Agent Instructions

Este repositorio usa construcción doble agéntica.

1. Leer y obedecer `RULES_SOS_SF.md`.
2. Para la construcción V1, leer íntegramente `START_HERE_ARQ.md`.
3. Leer después `ARQ_DEPLOY_OVERRIDE.md`; este archivo tiene precedencia sobre cualquier instrucción contradictoria de ejecución o despliegue.
4. Si el agente actúa como ARQ 🛠️, ejecutar la orden completa como un único tramo largo, continuo y autónomo.
5. No detenerse entre fases, no pedir aprobación intermedia y no esperar a AUD durante la construcción interna.
6. No declarar finalización sin SHA remoto, runs terminados, artifacts, despliegue Cloudflare verificado y checkpoint auditable.
7. No escribir en `simonkey888/Zungun`; sólo leerlo y reutilizar su semántica mediante el adapter desacoplado definido en el handoff.
8. Los secretos Cloudflare existen en GitHub Actions; no intentar leerlos ni pedirlos.

La orden vigente de construcción es:

```text
SOS-SF-HUMAN-ARQ-WEBAPP-V1-ONE-SHOT-001
```
