# Compatibilidad desacoplada con Zungun

Repositorio leído: `simonkey888/Zungun`.

- Rama predeterminada observada: `recovery/remote-toolchain-v1`
- SHA remoto leído: `13d6745217672da16985d815c427aa4c953de227`
- Archivos: `types.ts`, `state-machine.ts`, `receipts.ts`, `routing.ts`, `errors.ts`, `validation.ts`, `index.ts` bajo `canary/zep-core-canary/vendor/zep-core/src/`

Se reutiliza semántica, no código: IDs estables; prioridad; TTL; `UNKNOWN`; commitments; provenance; receipts separados del efecto; capacidades; failure reasons y validación defensiva. La mensajería privada agrega un mapping local de conversación, actores, destinatarios, idempotencia, compromiso, provenance y causa de falla sin acoplar el almacenamiento o transporte a Zungun.

`src/domain/zungun-compat` es el límite local versionado. No hay submodule, subtree, dependencia npm privada ni escritura en Zungun. La V1 no implementa ni afirma delivery garantizado, satélite, receipts autenticados o receiver persistente.
