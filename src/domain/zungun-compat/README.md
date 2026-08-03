# Límite local compatible con Zungun

Este módulo adopta sólo semántica: IDs estables, prioridad 0–3, TTL, `UNKNOWN`, provenance, commitments, estados de transporte y validación defensiva.

Fuente leída en modo read-only: `simonkey888/Zungun`, rama predeterminada `recovery/remote-toolchain-v1`, SHA `13d6745217672da16985d815c427aa4c953de227`.

No copia el runtime, no usa submodule ni crea dependencia de release. `mapToZungunEnvelope` es una representación local y no afirma transporte, entrega, recepción persistente, firma criptográfica, delivery garantizado ni exactly-once. Un estado de transporte tampoco prueba un efecto de negocio.
