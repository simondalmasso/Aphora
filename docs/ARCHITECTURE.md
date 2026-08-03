# Arquitectura V1

SOS Santa Fe es una PWA React/Vite servida por un Cloudflare Worker con Static Assets. El Worker intercepta sólo `/api/*` y `/lite`; no usa D1, KV, R2, Queue, Cron, rutas personalizadas ni dominio propio.

Los límites son: `data` aporta fixtures demo inmutables; `domain` deriva estado, TTL, contradicciones y compatibilidad; `worker` publica contratos read-only y headers; `client` representa una superficie única mobile-first. El service worker conserva el shell y el último snapshot, siempre acompañado por un timestamp y un aviso de que no es información actual.

## Confianza

La jerarquía de fuentes no convierte señales de modelo en órdenes. Sólo una comunicación oficial validada podría producir `EVACUACION_OFICIAL`; la V1 contiene exclusivamente fixtures demo.
