# Arquitectura de seguridad pública

SOS Santa Fe es una PWA mobile-first servida por un Cloudflare Worker. La lectura pública no requiere cuenta. El Worker agrega fuentes allowlisted, conserva timestamps originales, separa vigencia de frecuencia de consulta y publica contratos JSON validados.

## Capas

- `worker/providers`: allowlist HTTPS, timeout, tamaño máximo, content type, parsing defensivo, cache con `refreshMs` independiente de `freshMs`, circuit breaker y salud de transporte.
- `domain/public-safety`: vigencia, clasificación de feeds, alertas, timeline y reglas de estado que fallan a `UNKNOWN` cuando falta cobertura vigente.
- `worker/live-data`: estaciones INA, WaterML, SMN CAP, señales suplementarias y canales humanos claramente separados.
- `client`: hidrometría primero, contexto territorial, alertas/acciones esenciales y transparencia.
- `worker/auth`, `worker/reports`, D1 y KV: sesión propia, mensajería y reportes privados con TTL, límites e idempotencia.
- `service-worker`: shell offline y APIs privadas network-only; los tests E2E bloquean service workers cuando usan fixtures interceptados.

## Seguridad

Assets y APIs reciben CSP, HSTS, COOP, CORP, Permissions Policy, `nosniff` y `no-referrer`. Las URLs públicas del snapshot deben ser HTTPS. Google JWK usa timeout, cache corto e in-flight deduplicado. Las fotos se recodifican a JPEG en cliente y el Worker elimina metadata antes de KV; otros formatos directos se rechazan.

## Degradación

El Worker operativo no implica datos vigentes. Una estación desactualizada conserva su último valor y gráfico, pero el estado agregado no puede ser `NORMAL` si otra estación relevante queda `UNKNOWN`. Una señal NASA es suplementaria, no oficial local y nunca determina el estado principal.
