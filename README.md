# SOS Santa Fe

Web/PWA pública, demostrativa y no oficial para comprender un escenario hídrico ficticio de Santa Fe en menos de tres segundos: estado, cambios, fuentes, contradicciones y próxima acción.

El hero **Pulso del Paraná** explica el nivel con una superficie observada de 48 horas, una proyección de 24 horas con incertidumbre y umbrales demo. Three.js se carga sólo al entrar en viewport; SVG mantiene la lectura si WebGL no está disponible y `/lite` no ejecuta JavaScript ni WebGL.

## Ejecutar

```bash
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run test:contract
npm run build
npm run test:e2e
npm run deploy:dry
```

`npm run preview` inicia una previsualización equivalente del Worker con Static Assets. Rutas públicas: `/`, `/lite`, `/api/health`, `/api/snapshot`, `/api/sources`, `/api/messages`, `/api/auth/config`, `/api/session` y `/manifest.webmanifest`.

La superficie principal permanece abierta y sin login. Los dos controles del encabezado actualizan en paralelo snapshot/fuentes/mensajes y abren un centro con comunicaciones públicas. La bandeja privada es optativa, está desactivada de forma segura en el deployment inicial y no afecta la lectura pública.

## Activar la bandeja privada

La implementación usa Google Identity Services directo, sesión propia firmada y D1. No usa Auth0, One Tap, tokens Google persistidos, KV como fuente primaria ni WebSockets.

1. Crear una base con `npx wrangler d1 create sos-sf-messages` y agregar a `wrangler.jsonc` el binding `MESSAGES_DB` con el `database_id` devuelto.
2. Aplicar `npx wrangler d1 migrations apply sos-sf-messages --remote`.
3. Registrar como secretos del Worker `GOOGLE_CLIENT_ID` y `SESSION_SIGNING_KEY` (aleatorio, mínimo 32 bytes), más `SOS_SF_OPERATOR_EMAILS` como allowlist separada por comas. No colocarlos en el código ni como variables públicas.
4. Cambiar `PRIVATE_MESSAGING_ENABLED` a `true` y ejecutar el workflow manual `Deploy Workers`.
5. Verificar `/api/auth/config` (`enabled: true`), login, aislamiento entre conversaciones, logout y que `/`, `/lite` y APIs públicas sigan abiertas.

## Límites

Todos los datos públicos de V1 son `DEMO / NO OFICIAL`. No es una autoridad de alerta ni despacho de emergencias. El único texto libre previsto es privado, autenticado, limitado a 800 caracteres y dirigido asincrónicamente al equipo SOS verificado cuando la función se activa; nunca es un chat público. No usa trackers, fuentes externas de contenido o geolocalización y no promete transporte, lectura ni entrega de mensajes.
