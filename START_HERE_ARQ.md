# START HERE — ARQ ONE-SHOT HANDOFF

```text
PROJECT=SOS-SF
PUBLIC_NAME=SOS Santa Fe
ORDER_ID=SOS-SF-HUMAN-ARQ-WEBAPP-V1-ONE-SHOT-001
OWNER=SIMON
ROLE=ARQ 🛠️
MODE=LONG_AUTONOMOUS_HANDS_ON
EFFORT=MAX
LANGUAGE=ES_AR
DATE=2026-08-02

ONE_PROMPT_TARGET=YES
CODEX_PREFERRED=YES
WORK_ALLOWED=YES_IF_REPOSITORY_WRITE_SHELL_AND_CLOUDFLARE_AUTH_EXIST
WAIT_FOR_AUD_DURING_INTERNAL_BUILD=NO
FINAL_AUDIT_AFTER_REMOTE_CHECKPOINT=YES
```

Leer primero `RULES_SOS_SF.md`. Esta es una orden integral de construcción: diseño, arquitectura, implementación, pruebas, deployment, verificación, commit, push y checkpoint final. No pedir decisiones menores durante el tramo. Inferir con criterio, documentar y continuar.

---

## 1. MISIÓN

Construir una V1 completa, estética, rápida y desplegada de **SOS Santa Fe**, una Web/PWA pública para comprender el estado hídrico de la ciudad de Santa Fe, Argentina.

La aplicación debe responder en menos de tres segundos:

1. ¿Qué está pasando?
2. ¿Qué cambió?
3. ¿Qué fuentes sostienen el estado?
4. ¿Existen señales contradictorias?
5. ¿Qué acción corresponde ahora?

```text
PRODUCT_CLASS=PUBLIC_FLOOD_INFORMATION_WEB_PWA
OFFICIAL_SERVICE=NO
PUBLIC_ALERT_AUTHORITY=NO
EMERGENCY_DISPATCH=NO
CURRENT_DATA_MODE=DEMO_FIXTURES
ZUNGUN_RELATION=SEPARATE_PRODUCT_WITH_COMPATIBILITY_ADAPTER
```

La V1 no debe afirmar que existen evacuaciones, refugios, niveles o alertas reales cuando no se disponga de evidencia pública verificable. Todo fixture debe quedar marcado como `DEMO / NO OFICIAL`.

---

## 2. ¿SE PUEDE EN UN SOLO PROMPT?

Sí, como **un único tramo largo** cuando el agente dispone de:

- acceso de escritura al repositorio;
- terminal y Node/npm;
- Git;
- ejecución de tests y build;
- autenticación Cloudflare mediante Wrangler/OAuth o `CLOUDFLARE_API_TOKEN` seguro;
- capacidad de commit y push.

Codex es la superficie preferida para este trabajo de ingeniería. Work puede ejecutar el handoff sólo si realmente posee repositorio, shell y permisos de deployment. Si no dispone de alguna capacidad, no debe fingir resultados.

Un solo prompt no significa un solo intento interno. ARQ debe iterar autónomamente: implementar, ejecutar, detectar fallos, corregir, redeployar y verificar hasta completar el tramo.

---

## 3. ORDEN DE OPERACIÓN — WORKERS FIRST

El flujo obligatorio es:

```text
READ_REPOSITORIES
→ RESOLVE_CURRENT_HEADS
→ IMPLEMENT_LOCALLY
→ TEST_AND_BUILD
→ DEPLOY_CLOUDFLARE
→ VERIFY_REMOTE
→ FINALIZE_DOCS_AND_EVIDENCE
→ COMMIT_ON_MAIN
→ PUSH_GITHUB
→ PUBLISH_MATERIAL_CHECKPOINT
```

“Workers first” no autoriza editar producción sin fuente local. Significa que el deployment verificado precede al commit remoto final del tramo.

### Cloudflare antes de comenzar

Ejecutar:

```bash
npx wrangler --version
npx wrangler whoami
```

Prioridad de autenticación:

1. OAuth ya configurado mediante Wrangler.
2. `CLOUDFLARE_API_TOKEN` inyectado como secreto del entorno.
3. Deployment temporal permitido por la versión instalada de Wrangler.
4. Si no existe autenticación ni deployment temporal posible, completar implementación, tests y build; declarar `DEPLOY_BLOCKED_AUTH`. No inventar una URL.

No almacenar tokens, account IDs sensibles ni credenciales en Git, logs o artifacts.

### Política de recursos V1

Usar **Workers + Static Assets**. No crear Pages. No conectar todavía GitHub auto-deployments.

La V1 no requiere D1, KV, R2, Queues ni Cron. Esto aumenta la probabilidad de completar el one-shot sin provisioning. La arquitectura debe admitirlos después, pero no crearlos por apariencia.

Nombre preferido del Worker:

```text
sos-sf
```

Antes de desplegar, comprobar si ya existe. No sobrescribir un Worker ajeno o una producción previa sin identificarlo. Si el nombre está ocupado de manera no atribuible al proyecto, usar `sos-sf-v1` y documentarlo.

No configurar custom domain ni routes en este tramo. Usar `workers.dev`.

---

## 4. IDENTIDAD VISUAL CERRADA

```text
STYLE=APPLE_WHITE_LOW
FEEL=CALM_PRECISE_PREMIUM
PRIMARY_SURFACE=ONE_CLEAR_DASHBOARD
SUBMENUS=NONE
ENDLESS_SCROLL=FORBIDDEN
HEAVY_MAP_FIRST=NO
```

La app debe ser **linda de verdad**: minimalista, blanca, moderna, suave, con gráficos refinados, pero muy rápida y usable bajo estrés. Inspiración conceptual sin copiar marcas, assets o pantallas completas:

- Apple Weather / Health: jerarquía, grandes números, espacios, tarjetas calmadas.
- FEMA: alerta sobria y lectura inmediata.
- Watch Duty: estado, fuentes y actualización visible.
- RiverApp / RiverAware: niveles, umbrales y tendencia.

### Paleta

Implementar design tokens CSS:

```text
background       off-white cercano a #F5F5F3
surface          #FFFFFF
surface-muted    gris muy claro
text-primary     casi negro
text-secondary   gris medio
line             rgba oscuro muy bajo
water            azul profundo o glacial contenido
safe             verde sobrio
watch            ámbar cálido
critical         rojo controlado
```

No usar neón, sombras duras, gradientes estridentes, glassmorphism excesivo, fondos negros dominantes ni rojo como decoración permanente.

### Tipografía

System stack, sin fuentes externas:

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
```

Usar números tabulares para alturas, lluvia y horarios.

### Movimiento

- microtransiciones de 160–260 ms;
- easing natural;
- entrada sutil de tarjetas;
- actualización numérica sin saltos;
- gráficos que se revelan suavemente;
- cero parallax;
- cero loops decorativos;
- respetar `prefers-reduced-motion`;
- objetivo 60 fps en hardware medio.

---

## 5. LAYOUT: TODO A LA VISTA

### Desktop

La información crítica debe caber aproximadamente en 1440×900 sin scroll significativo.

```text
┌─────────────────────────────────────────────────────────────┐
│ SOS Santa Fe | estado | hora | DEMO / NO OFICIAL          │
├─────────────────────────────────┬───────────────────────────┤
│ ESTADO ACTUAL + QUÉ CAMBIÓ      │ NIVEL + GRÁFICO          │
│ 7 columnas                      │ 5 columnas                │
├───────────────────┬─────────────┼───────────────────────────┤
│ LLUVIA            │ FUENTES     │ REFUGIOS / PUNTOS         │
│ 4                 │ 4           │ 4                         │
├─────────────────────────────────┬───────────────────────────┤
│ COMUNICACIONES                  │ QUÉ HACER AHORA           │
│ 8                               │ 4                         │
└─────────────────────────────────┴───────────────────────────┘
```

Sólo se permite una modal/sheet accesible para detalles. No usar sidebar, hamburger, submenús, tabs anidados ni navegación laberíntica.

### Mobile

No mentir intentando meter todo en un viewport. Prioridad:

1. Primer viewport: estado, tendencia, qué cambió y acción.
2. Segundo: gráfico, lluvia y fuentes.
3. Tercero máximo: comunicaciones y refugios.

Objetivo: 2,5–3 pantallas móviles como máximo, sin feed infinito. Header sticky mínimo. Mapa pesado fuera de la portada V1.

### Prohibiciones

```text
NO_ENDLESS_SCROLL
NO_HAMBURGER_MENU
NO_SIDEBAR
NO_CRITICAL_CAROUSEL
NO_HIDDEN_PRIMARY_STATUS
NO_20_EQUAL_CARDS
NO_NEWS_FEED
NO_SOCIAL_FEED
NO_AUTOPLAY
```

---

## 6. MÓDULOS FUNCIONALES V1

### 6.1 Estado actual

Estados públicos:

```text
NORMAL
VIGILANCIA
ALERTA
EVACUACION_OFICIAL
UNKNOWN
```

Mostrar estado humano, explicación breve, fuente dominante, última actualización, vigencia y acción recomendada. Una señal de modelo nunca se convierte automáticamente en orden de evacuación.

### 6.2 Qué cambió

Comparar snapshot actual y anterior. Mostrar hasta cuatro cambios:

- nivel subió o bajó;
- cambió la lluvia;
- apareció/venció una alerta;
- una fuente quedó desactualizada;
- apareció una contradicción;
- cambió el estado de un refugio.

### 6.3 Nivel del río

Gráfico ligero en SVG o Canvas, preferentemente propio. Debe incluir:

- valor actual;
- delta 1 h, 6 h y 24 h si existe;
- tendencia;
- timestamp;
- bandas de umbral;
- tooltip accesible;
- estado sin datos;
- no inventar interpolaciones presentadas como mediciones.

### 6.4 Lluvia

- acumulado 1 h y 24 h;
- mini-gráfico;
- pronóstico breve cuando exista;
- fuente, vigencia y estado del dato.

### 6.5 Fuentes y confianza

Tipos:

```text
OFFICIAL_OBSERVATION
OFFICIAL_ALERT
FORECAST_MODEL
SATELLITE_OBSERVATION
COMMUNITY_REPORT
INTERNAL_DERIVATION
DEMO_FIXTURE
```

Estado de fuente:

```text
FRESH
STALE
UNAVAILABLE
UNKNOWN
```

Mostrar nombre, actualización, aporte, frescura y contradicciones.

### 6.6 Contradicciones

Preservar incertidumbre:

```text
Modelo: riesgo elevado
Observación: tendencia ascendente sin umbral extraordinario
Autoridad: sin alerta activa
Resultado: VIGILANCIA / UNKNOWN
```

No elegir arbitrariamente una fuente para mantener la pantalla verde.

### 6.7 Refugios y puntos

Estados:

```text
PREIDENTIFIED
PREPARING
ACTIVE
LIMITED_CAPACITY
FULL
CLOSED
UNKNOWN
```

V1: fixtures explícitos o datos públicos confirmados. No publicar rumores ni centros informales.

### 6.8 Qué hacer ahora

Tarjeta compacta con acciones según estado y teléfonos configurables. Debe decir que la plataforma no sustituye al 911, 103 ni organismos oficiales.

### 6.9 Modo lite y PWA

Rutas:

```text
/                  dashboard
/lite              HTML mínimo, textual y sin JavaScript obligatorio
/api/health        salud
/api/snapshot      snapshot compacto
/api/sources       estado de fuentes
/api/messages      comunicaciones
/manifest.webmanifest
```

PWA:

- app shell cacheado;
- último snapshot cacheado;
- indicador visible de modo offline;
- timestamp absoluto del dato guardado;
- jamás presentar cache como estado actual.

### 6.10 Comunicaciones

Diseñar desde V1. No construir chat social.

Tipos:

```text
OFFICIAL_NOTICE
WEATHER_WARNING
SHELTER_UPDATE
SOURCE_CONTRADICTION
SYSTEM_STATUS
COMMUNITY_VERIFIED_REPORT
```

Reglas:

- máximo cinco mensajes visibles;
- prioridad + vigencia, no engagement;
- fuente, hora, TTL, área y estado;
- API read-only;
- sin cuenta;
- sin DM;
- sin comentarios;
- sin texto libre ciudadano;
- sin botón que prometa despachar emergencias.

---

## 7. INTEGRACIÓN PARALELA CON ZUNGUN

Zungun y SOS-SF avanzan en paralelo. SOS-SF puede reutilizar todo lo útil, pero no puede depender de que Zungun termine ni importar ciegamente una rama recovery.

### Fuente

```text
REPOSITORY=https://github.com/simonkey888/Zungun
READ_ONLY_FROM_SOS_ARQ=YES
WRITE_TO_ZUNGUN=NO
```

Al inicio, resolver y registrar:

```text
ZUNGUN_DEFAULT_BRANCH=
ZUNGUN_REMOTE_HEAD_SHA=
ZUNGUN_FILES_READ=
```

Leer como mínimo, si existen:

```text
canary/zep-core-canary/vendor/zep-core/src/types.ts
canary/zep-core-canary/vendor/zep-core/src/state-machine.ts
canary/zep-core-canary/vendor/zep-core/src/receipts.ts
canary/zep-core-canary/vendor/zep-core/src/routing.ts
canary/zep-core-canary/vendor/zep-core/src/errors.ts
canary/zep-core-canary/vendor/zep-core/src/validation.ts
canary/zep-core-canary/vendor/zep-core/src/index.ts
```

### Semántica a reutilizar

- IDs estables;
- prioridad 0–3;
- `createdAt` / `expiresAt` y TTL;
- estado explícito `UNKNOWN`;
- eventos/operaciones inmutables;
- commitments o hashes de evidencia;
- provenance;
- receipts diferenciados de business effect;
- capacidades/estado de transporte;
- failure reasons;
- deduplicación conceptual;
- defensive validation.

### Estrategia obligatoria

Crear un límite local, por ejemplo:

```text
src/domain/zungun-compat/
├── types.ts
├── mapper.ts
├── validation.ts
├── provenance.ts
└── README.md
```

No usar submodule, subtree, copy masivo ni dependencia npm privada en V1.

Implementar sólo el subconjunto necesario y documentar correspondencia con el SHA remoto leído. Si Zungun cambia, SOS-SF conserva su contrato local.

Contrato sugerido:

```ts
type CriticalMessage = {
  id: string;
  type: "OFFICIAL_NOTICE" | "WEATHER_WARNING" | "SHELTER_UPDATE" |
        "SOURCE_CONTRADICTION" | "SYSTEM_STATUS" | "COMMUNITY_VERIFIED_REPORT";
  title: string;
  body: string;
  sourceId: string;
  geographicScope: string[];
  createdAt: string;
  expiresAt: string;
  priority: 0 | 1 | 2 | 3;
  status: "ACTIVE" | "EXPIRED" | "RETRACTED" | "UNKNOWN";
  evidenceRefs: string[];
  commitment?: string;
};
```

Crear tests de mapping y TTL. No afirmar que SOS-SF ya posee delivery garantizado, mensajería satelital, receipts firmados o receiver persistente. Esos son futuros módulos.

---

## 8. STACK Y ESTRUCTURA

### Stack preferido

```text
LANGUAGE=TypeScript
FRONTEND=React + Vite
RUNTIME=Cloudflare Workers
STATIC=Workers Static Assets
STYLING=CSS tokens + CSS modules or disciplined global CSS
UNIT_TESTS=Vitest
E2E=Playwright
PACKAGE_MANAGER=npm
CHARTS=custom SVG/Canvas preferred
```

Evitar Tailwind, UI frameworks, Redux, grandes suites de gráficos y mapas salvo justificación medida. Priorizar bundle pequeño y código entendible.

### Árbol objetivo

```text
sos-sf/
├── README.md
├── RULES_SOS_SF.md
├── START_HERE_ARQ.md
├── AGENTS.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── wrangler.jsonc
├── index.html
├── public/
│   ├── manifest.webmanifest
│   ├── icons/
│   └── offline.html
├── src/
│   ├── client/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── styles/
│   │   └── pwa/
│   ├── worker/
│   │   ├── index.ts
│   │   ├── router.ts
│   │   ├── responses.ts
│   │   └── security.ts
│   ├── domain/
│   │   ├── snapshot.ts
│   │   ├── sources.ts
│   │   ├── messages.ts
│   │   ├── shelters.ts
│   │   ├── state.ts
│   │   ├── validation.ts
│   │   └── zungun-compat/
│   ├── data/
│   │   ├── demo-snapshot.ts
│   │   └── source-registry.ts
│   └── shared/
├── tests/
│   ├── unit/
│   ├── contract/
│   ├── accessibility/
│   └── e2e/
├── scripts/
│   ├── verify-build.mjs
│   └── verify-deployment.mjs
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATA_SOURCES.md
│   ├── DESIGN_SYSTEM.md
│   ├── SAFETY_AND_CLAIMS.md
│   ├── MESSAGING_MODULE.md
│   ├── ZUNGUN_INTEGRATION.md
│   └── PROVENANCE.md
└── artifacts/
    └── README.md
```

Se permite una estructura más simple si mantiene límites claros.

---

## 9. CLOUDFLARE IMPLEMENTATION

Usar configuración actual y documentación oficial. Reglas:

- Wrangler v4 actual;
- `wrangler.jsonc`;
- `compatibility_date` del día de implementación;
- Static Assets integrados al Worker;
- API sólo bajo `/api/*`;
- assets estáticos servidos directamente;
- SPA fallback correcto;
- `wrangler types` si aplica;
- no interfaces Env manuscritas si se pueden generar;
- Promises siempre awaited/returned/`waitUntil`;
- sin estado mutable por request en global;
- sin secretos hardcodeados;
- logs JSON sin datos personales;
- errores explícitos, sin stack traces públicos.

Headers mínimos:

```text
Content-Security-Policy
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin or stricter
Permissions-Policy restrictiva
Cross-Origin-Resource-Policy when compatible
```

No añadir analítica, trackers ni geolocalización automática.

---

## 10. DATOS DEMO

Construir un escenario ficticio coherente:

```text
MODEL_SIGNAL=ELEVATED
OFFICIAL_PUBLIC_ALERT=NONE
RIVER_OBSERVATION=RISING_SLOWLY
ACTIVE_SHELTERS=0
DERIVED_STATE=VIGILANCIA_OR_UNKNOWN
```

No usar cifras inventadas atribuidas a INA, Provincia, Municipalidad, Google o SMN. Nombrar las fuentes como `Modelo demo`, `Estación demo`, `Autoridad demo` y mostrar `DEMO / NO OFICIAL`.

La UI debe demostrar especialmente:

```text
SEÑAL_DE_MODELO
+ OBSERVACION_NO_CONCLUYENTE
+ SIN_ALERTA_OFICIAL
→ UNKNOWN / VIGILANCIA
```

---

## 11. RENDIMIENTO

Budgets de producción:

```text
INITIAL_JS_GZIP_TARGET <= 120 KB
INITIAL_CSS_GZIP_TARGET <= 25 KB
NO_EXTERNAL_FONTS
NO_THIRD_PARTY_TRACKERS
LCP_TARGET <= 2.0 s under reasonable mobile simulation
CLS_TARGET <= 0.05
INTERACTIVE_WITHOUT_MAP=YES
```

Medir y registrar. Si un objetivo no se alcanza, optimizar antes del checkpoint y documentar el remanente.

---

## 12. ACCESIBILIDAD

Piso WCAG AA:

- navegación completa por teclado;
- landmarks y headings correctos;
- contraste suficiente;
- estados no dependientes sólo del color;
- tooltips accesibles;
- focus visible;
- `aria-live` prudente para cambios críticos;
- reduced motion;
- zoom 200 % utilizable;
- textos claros;
- modo lite usable sin JavaScript.

---

## 13. TESTS OBLIGATORIOS

### Unitarios

- derivación de estado;
- contradicciones;
- TTL y expiración;
- freshness de fuentes;
- prioridad de mensajes;
- mapping Zungun-compatible;
- serialización de snapshot;
- validación defensiva.

### Contrato API

- `/api/health`;
- `/api/snapshot`;
- `/api/sources`;
- `/api/messages`;
- content types;
- schema estable;
- error shape;
- caching apropiado.

### E2E

- carga dashboard desktop;
- mobile sin overflow horizontal;
- no submenús;
- estado y acción visibles en primer viewport;
- modo lite;
- offline shell;
- modal accesible;
- fixture demo inequívoco;
- comunicaciones ordenadas;
- ausencia de requests de terceros innecesarios.

### Calidad

Ejecutar, según scripts creados:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npx wrangler deploy --dry-run
```

Luego deploy real y verificación HTTP remota.

---

## 14. FASES DEL TRAMO

### Fase A — Preflight

- leer reglas y handoff;
- resolver SHA de SOS-SF;
- resolver SHA de Zungun;
- comprobar herramientas y Cloudflare auth;
- inspeccionar si existe Worker;
- registrar baseline.

### Fase B — Arquitectura y contratos

- crear estructura;
- tipos de dominio;
- demo fixtures;
- adapter Zungun-compatible;
- rutas API;
- decisiones documentadas.

### Fase C — Sistema visual

- tokens;
- layout desktop/mobile;
- componentes;
- gráficos suaves;
- microinteracciones;
- accesibilidad.

### Fase D — Worker/PWA

- API;
- static assets;
- headers;
- `/lite`;
- manifest;
- offline cache;
- errores y health.

### Fase E — Verificación local

- typecheck;
- lint;
- unit;
- contracts;
- e2e;
- build;
- budgets;
- dry-run.

### Fase F — Deploy Workers-first

- deploy;
- resolver URL;
- verificar status, HTML, APIs, headers y assets;
- corregir y redeployar hasta verde.

### Fase G — GitHub

Después del deploy remoto verificado:

- actualizar documentación y evidencia;
- un único commit material o una pequeña serie coherente, no microcommits;
- push a `main`;
- verificar SHA remoto exacto.

### Fase H — Checkpoint

Publicar un issue de checkpoint o, si no existe issue, crear uno titulado:

```text
V1 checkpoint — Workers-first public demo
```

Incluir evidencia completa.

---

## 15. ARTEFACTOS

Generar bajo `artifacts/v1/`:

```text
build-summary.json
verification.json
deployment-proof.json
bundle-sizes.json
test-summary.md
screenshots/
  desktop.png
  mobile.png
```

No incluir secretos, cookies, tokens, headers de autenticación ni datos personales.

`deployment-proof.json` debe registrar:

```text
worker_name
workers_dev_url
deployed_at_utc
remote_status
api_health_status
verified_paths
source_commit_or_precommit_tree_reference
cloudflare_account_identity_redacted_or_non_sensitive
```

---

## 16. CRITERIOS DE ACEPTACIÓN

```text
AT01=RULES_READ
AT02=SOS_REMOTE_BASELINE_RECORDED
AT03=ZUNGUN_REMOTE_SHA_RECORDED
AT04=ZUNGUN_COMPAT_ADAPTER_IMPLEMENTED_WITHOUT_HARD_COUPLING
AT05=DESKTOP_CRITICAL_DATA_VISIBLE_WITHOUT_ENDLESS_SCROLL
AT06=MOBILE_MAX_APPROX_THREE_SCREENS
AT07=NO_SUBMENUS_OR_SIDEBAR
AT08=APPLE_WHITE_LOW_VISUAL_DIRECTION_MET
AT09=SMOOTH_MOTION_AND_REDUCED_MOTION
AT10=RIVER_AND_RAIN_GRAPHS_PRESENT
AT11=CONTRADICTION_AND_UNKNOWN_VISIBLE
AT12=COMMUNICATIONS_MODULE_PRESENT_READ_ONLY
AT13=DEMO_DATA_CLEARLY_LABELED
AT14=MODE_LITE_PRESENT
AT15=PWA_OFFLINE_SNAPSHOT_PRESENT
AT16=NO_EXTERNAL_TRACKERS_OR_FONTS
AT17=TYPECHECK_GREEN
AT18=LINT_GREEN
AT19=UNIT_TESTS_GREEN
AT20=CONTRACT_TESTS_GREEN
AT21=E2E_GREEN
AT22=PRODUCTION_BUILD_GREEN
AT23=WRANGLER_DRY_RUN_GREEN
AT24=CLOUDFLARE_DEPLOY_VERIFIED_OR_EXPLICIT_AUTH_BLOCK
AT25=REMOTE_GITHUB_SHA_PUBLISHED
AT26=ARTIFACTS_AVAILABLE
AT27=CHECKPOINT_PUBLISHED
```

Si Cloudflare auth está correctamente disponible, `AT24` sólo pasa con deployment remoto real verificado.

---

## 17. PROHIBICIONES

```text
NO_FALSE_OFFICIAL_CLAIMS
NO_FAKE_REAL_TIME
NO_RUMOR_AS_DATA
NO_ALGORITHMIC_EVACUATION_ORDER
NO_911_BRANDING_AS_DISPATCH
NO_OPEN_CHAT
NO_CITIZEN_FREE_TEXT_IN_V1
NO_SATELLITE_MESSAGING_CLAIM
NO_GUARANTEED_DELIVERY_CLAIM
NO_UNIVERSAL_EXACTLY_ONCE
NO_HARDCODED_SECRETS
NO_GITHUB_AUTO_DEPLOY_SETUP
NO_CUSTOM_DOMAIN
NO_WRITES_TO_ZUNGUN
NO_WAITING_FOR_AUD_INSIDE_BUILD
```

---

## 18. STOP CONDITIONS

ARQ sólo debe detenerse antes del checkpoint por:

- imposibilidad real de escribir el repositorio;
- repositorio equivocado;
- credenciales Cloudflare ausentes cuando el entorno tampoco permite deployment temporal, después de completar todo lo local posible;
- riesgo de sobrescribir una producción existente no identificada;
- exposición de secretos;
- restricción de seguridad de la plataforma.

Errores de código, tests, diseño, dependencias o deploy corregibles no son stop conditions. Iterar y resolver.

---

## 19. REPORTE FINAL DE ARQ

Responder al owner únicamente cuando exista checkpoint material:

```text
ORDER_ID=SOS-SF-HUMAN-ARQ-WEBAPP-V1-ONE-SHOT-001
STATUS=COMPLETE|PARTIAL_BLOCKED
SOS_BASE_SHA=
ZUNGUN_SOURCE_SHA=
REMOTE_HEAD_SHA=
WORKER_NAME=
DEPLOYMENT_URL=
DEPLOYMENT_STATUS=
TYPECHECK=
LINT=
UNIT_TESTS=
CONTRACT_TESTS=
E2E_TESTS=
BUILD=
BUNDLE_JS_GZIP=
BUNDLE_CSS_GZIP=
ARTIFACT_PATH=
CHECKPOINT_ISSUE_URL=
KNOWN_LIMITATIONS=
AUD_READY=YES|NO
STOP=TRUE
```

No pedir auditoría antes de este reporte salvo emergencia definida en `RULES_SOS_SF.md`.
