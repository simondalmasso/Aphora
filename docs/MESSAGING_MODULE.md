# Comunicaciones críticas

El módulo es una bandeja read-only de hasta cinco mensajes, ordenada por prioridad, creación e ID. Cada mensaje tiene tipo cerrado, área, fuente, `createdAt`, `expiresAt`, prioridad 0–3, estado, evidencia y provenance.

El TTL es estricto: al llegar a `expiresAt`, deja de ser visible. `UNKNOWN` permanece explícito. El endpoint `/api/messages` declara `deliveryClaims: NONE` porque publicar una estructura no demuestra transporte ni efecto de negocio.
