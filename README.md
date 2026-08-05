# SOS Santa Fe

PWA pública e independiente que organiza alertas oficiales, situación territorial, mediciones hidrométricas, contactos esenciales y preparación para emergencias en Santa Fe.

No pertenece al Gobierno ni reemplaza a los organismos competentes. La portada separa estrictamente:

- alertas oficiales;
- observaciones instrumentales;
- recomendaciones preventivas;
- reportes ciudadanos privados;
- estado técnico del servicio.

## Arquitectura

- React + TypeScript + Vite.
- Cloudflare Worker con Static Assets.
- D1 Free para sesiones, mensajería, reportes, moderación y metadata.
- Workers KV Free (`REPORTS_KV`) para fotos privadas sanitizadas con TTL.
- Sin R2, checkout, servicios pagos, trackers, fuentes externas ni Three.js.
- Service worker con shell, contactos y guía offline; las APIs privadas son network-only.

## Desarrollo y gates

```bash
npm ci
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:unit
npm run test:contract
npm run build
npm run test:worker
npm run test:e2e
npm run deploy:dry
```

Rutas públicas principales: `/`, `/lite`, `/api/health`, `/api/snapshot`, `/api/sources`, `/api/messages`, `/api/essential-contacts`, `/api/auth/config` y `/api/session`.

## Interpretación

`observedAt`, `fetchedAt`, `generatedAt` y `validUntil` nunca son equivalentes. Una medición vencida queda como última medición disponible y no permite inferir ausencia de riesgo. Un nivel por encima de un umbral de referencia no constituye una orden de evacuación.

Las alertas oficiales se normalizan conceptualmente según CAP 1.2. La ausencia de alertas sólo se comunica cuando el canal automático relevante está disponible y vigente. Los canales oficiales sin endpoint estable se enlazan para verificación humana y no se simulan como integraciones automáticas.

## Funciones privadas

Google Identity Services directo y sesión propia firmada habilitan mensajería y reportes. Los reportes ciudadanos nunca cambian automáticamente el estado público. Máximo dos fotos privadas, sanitización, TTL, acceso corto de un solo uso, moderación, idempotencia y límites de tasa.

Reportar una situación no inicia un despacho de emergencia. Ante peligro inmediato se debe llamar al servicio correspondiente.
