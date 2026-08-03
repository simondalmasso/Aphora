# Arquitectura V1

SOS Santa Fe es una PWA React/Vite servida por un Cloudflare Worker con Static Assets sobre `workers.dev`, sin Pages, dominio propio ni Workers Routes. El Worker intercepta `/api/*` y `/lite`, aplica headers de seguridad también a los assets y mantiene abierta toda la lectura pública.

Los límites son: `data` aporta fixtures demo inmutables; `domain` deriva estado, TTL, contradicciones, mensajería y compatibilidad; `worker` publica contratos, autenticación y autorización; `client` representa una superficie única mobile-first. El service worker precachea el HTML y descubre/cachea sus assets de build antes de activarse. Si una navegación falla, sirve una shell offline autónoma —sin depender del bundle— con snapshot demo, timestamp y aviso explícito de que no es información actual.

## Render progresivo del Pulso

`ParanaPulse.tsx` entrega primero semántica, métricas y SVG. Al entrar en viewport importa dinámicamente `client/three/pulse-three.ts`, que expone sólo las piezas de Three.js utilizadas. La escena no usa luces, sombras ni postprocesado. Sus mallas están limitadas a 48×10 segmentos observados y 24×16 proyectados, con 18 partículas, DPR ≤1,5 y scheduler ≤30 FPS.

`IntersectionObserver` detiene el loop fuera de viewport; `ResizeObserver` ajusta el canvas sin sobrerender. Reduced motion deja un frame estático, un error o pérdida de contexto conserva el SVG, y `/lite` no contiene scripts. El manifest de Vite permite medir por separado el entry inicial y el chunk visual dinámico: el presupuesto inicial histórico de 120 KiB gzip permanece intacto; el chunk visual diferido tiene un límite explícito adicional de 180 KiB gzip.

## Centro de mensajes

Las comunicaciones públicas son read-only, visibles sin cuenta y limitadas a cinco. La bandeja privada queda tras `PRIVATE_MESSAGING_ENABLED`, Google Identity Services directo, firma de sesión propia y binding D1 `MESSAGES_DB`. En el deployment inicial la bandera está en `false`: no existe login ficticio ni dependencia de credenciales ausentes.

D1 es la fuente primaria consultable para conversaciones, mensajes, idempotencia, rate events y auditoría sin contenido. El cliente usa polling acotado de 15 segundos sólo mientras la bandeja está abierta; no usa sockets ni scroll infinito. El servicio elimina mensajes vencidos y eventos históricos en mantenimiento oportunista con retención de 30 días.

## Confianza

La jerarquía de fuentes no convierte señales de modelo en órdenes. Sólo una comunicación oficial validada podría producir `EVACUACION_OFICIAL`; la V1 contiene exclusivamente fixtures demo. Autenticarse no convierte una comunicación privada en un canal de emergencias ni garantiza entrega, lectura o respuesta.
