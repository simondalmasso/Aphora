# SOS-SF 015 — Visual Product Restore A

```text
OWNER_CORRECTION=SOS-SF-015-VISUAL-PRODUCT-RESTORE-A
PARENT_ORDER=SOS-SF-OWNER-GLOBAL-PUBLIC-SAFETY-REFOUNDATION-015
STATUS=ACTIVE
BRANCH=arq/visual-dashboard-v3
DEPLOY_BEFORE_VISUAL_APPROVAL=PROHIBITED
MAX_DEPLOY_AFTER_APPROVAL=1
BUDGET_MAX_USD=0
R2=PROHIBITED
WORKERS_PAID=PROHIBITED
```

## Motivo

La refundación 015 corrigió semántica, transparencia, vigencia y arquitectura de fuentes, pero degradó la portada al exponer información técnica extensa y reducir el recurso visual hidrométrico principal.

Esta corrección no revierte 015. Conserva sus contratos públicos y recompone la experiencia ciudadana.

## Invariantes preservados

- denominaciones institucionales vigentes;
- separación entre observación, recepción y vigencia;
- clasificación honesta de fuentes;
- alertas fail-closed;
- D1 + KV Free, sin R2 ni plan pago;
- seguridad, accesibilidad y provenance;
- modo offline, modo lite, mensajería y reportes privados.

## Portada obligatoria

1. Encabezado institucional compacto.
2. Una banda principal de alerta oficial por condición.
3. Situación actual y acción principal.
4. Gráfico hidrométrico amplio e interactivo.
5. Resumen compacto de la segunda estación.
6. Qué hacer ahora y teléfonos.
7. Reportar una situación.
8. Acceso a `Datos y fuentes`.

La portada no debe parecer documentación técnica ni exponer el inventario completo, estado interno de proveedores, limitaciones de WaterML, credenciales faltantes, canales humanos, degradaciones del integrador, metodología extensa o estado técnico de API.

## Gráfico principal

- selector `Río Paraná — Santa Fe` / `Río Salado — Santo Tomé`;
- serie histórica observada con fechas reales y unidad en metros;
- discontinuidades visibles, sin interpolación presentada como dato;
- umbrales horizontales identificados;
- interacción por mouse, toque y teclado;
- lectura accesible y tabla alternativa;
- fecha observada y vigencia dentro del bloque;
- sin gauge semicircular ni proyección ficticia;
- alto contraste y tamaño de visualización principal, no sparkline ornamental.

## Lenguaje público

- sin `Con conexión` en el encabezado;
- antigüedad en lenguaje humano;
- timestamps inválidos o Unix epoch nunca visibles;
- enums internos traducidos;
- sin contadores de fuentes operativas;
- feeds agrupados por función y organismo;
- fallas técnicas fuera del timeline ciudadano;
- máximo una advertencia principal por condición.

## Gate visual previo al deploy

Antes de cualquier deploy deben existir capturas desktop y móvil de:

1. la versión anterior con el gráfico principal;
2. la implementación 015 actualmente desplegada;
3. la corrección propuesta.

La evidencia debe demostrar simultáneamente:

- transparencia 015 preservada;
- claridad visual y gráfico útil recuperados;
- ausencia de paredes de texto, enums y fechas inválidas;
- información crítica dentro de aproximadamente dos pantallas móviles;
- ningún deploy ni mutación Cloudflare durante validación.

Sólo una aprobación visual explícita del owner habilita un único deploy posterior.
