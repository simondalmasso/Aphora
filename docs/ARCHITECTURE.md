# Arquitectura V1

SOS Santa Fe es una PWA React/Vite servida por un Cloudflare Worker con Static Assets sobre `workers.dev`, sin Pages, dominio propio ni Workers Routes. El Worker intercepta `/api/*` y `/lite`, aplica headers de seguridad también a los assets y mantiene abierta toda la lectura pública.

Los límites son: `data` aporta fixtures demo inmutables; `domain` deriva estado, TTL, contradicciones, mensajería y compatibilidad; `worker` publica contratos, autenticación y autorización; `client` representa una superficie única mobile-first. El service worker conserva shell y último snapshot con timestamp y aviso de que no es información actual.

## Centro de mensajes

Las comunicaciones públicas son read-only, visibles sin cuenta y limitadas a cinco. La bandeja privada queda tras `PRIVATE_MESSAGING_ENABLED`, Google Identity Services directo, firma de sesión propia y binding D1 `MESSAGES_DB`. En el deployment inicial la bandera está en `false`: no existe login ficticio ni dependencia de credenciales ausentes.

D1 es la fuente primaria consultable para conversaciones, mensajes, idempotencia, rate events y auditoría sin contenido. El cliente usa polling acotado de 15 segundos sólo mientras la bandeja está abierta; no usa sockets ni scroll infinito. El servicio elimina mensajes vencidos y eventos históricos en mantenimiento oportunista con retención de 30 días.

## Confianza

La jerarquía de fuentes no convierte señales de modelo en órdenes. Sólo una comunicación oficial validada podría producir `EVACUACION_OFICIAL`; la V1 contiene exclusivamente fixtures demo. Autenticarse no convierte una comunicación privada en un canal de emergencias ni garantiza entrega, lectura o respuesta.
