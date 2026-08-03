# SOS Santa Fe

Web/PWA pública, demostrativa y no oficial para comprender un escenario hídrico ficticio de Santa Fe en menos de tres segundos: estado, cambios, fuentes, contradicciones y próxima acción.

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

`npm run preview` inicia el Worker local con Static Assets. Rutas públicas: `/`, `/lite`, `/api/health`, `/api/snapshot`, `/api/sources`, `/api/messages` y `/manifest.webmanifest`.

## Límites

Todos los datos de V1 son `DEMO / NO OFICIAL`. No es una autoridad de alerta ni despacho de emergencias; no recibe texto ciudadano libre; no usa trackers, fuentes externas o geolocalización; no promete transporte o entrega de mensajes.
