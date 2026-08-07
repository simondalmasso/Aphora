# SOS-SF 021 — MUNI chassis reverse

## Autoridad y toma

- Orden: `SOS-SF-AUD-MUNI-CHASSIS-MEGA-REVERSE-REDESIGN-021`
- TAKE_HEAD vinculante: `810fdc47901adf7aa7108d39f4d4047ae56b3295`
- `main` esperado e intocable: `45047d1c1e16941ea37967d67307d0ab17e85fad`
- No existe rollback autorizado a `14d9c9c...`.

## Reverse ejecutado antes de UI

El run `31166104610` abrió con Playwright real las referencias municipales en los ocho viewports exigidos y preservó DOM/computed output y capturas en el artifact `8989056357` (`sha256:f943caea21f240e41a92a93e244a7583160cbc53bfc94b4450e0510d935cb515`).

La referencia respondió al navegador automatizado con la verificación anti-bot de Cloudflare (`title=Just a moment...`). Por lo tanto, los computed styles de ese artifact son evidencia del bloqueo, **no** mediciones válidas del chasis municipal. No se declara pixel-perfect ni se inventan valores ausentes.

Para la arquitectura de información se usa además la estructura pública visible/crawleable actual (Gobierno, Servicios, Transparencia, accesos rápidos, módulos editoriales y footer), y para la gramática visual se aplican las observaciones explícitas de la orden: navy dominante, transición verde/turquesa, fondos claros y banner El Niño navy con título blanco y motivo lineal.

## Tipografía

La familia real no pudo medirse de forma fiable por el challenge. No se extraen ni copian archivos de fuente. SOS-SF usa `Arial, Helvetica Neue, Helvetica, system-ui, sans-serif`, con jerarquía y escalas propias verificadas en runtime.

## Paleta implementada

- `--muni-navy-950: #071c32`
- `--muni-navy-900: #0a2747`
- `--muni-navy-800: #103659`
- `--muni-navy-700: #174b73`
- `--muni-accent-700: #007f73`
- `--muni-accent-600: #009b88`
- `--muni-accent-500: #20b89f`
- `--muni-neutral-50: #f8fafb`

Los nombres `muni-*` significan referencia cromática, no afiliación.

## Identidad

La marca de producto es `SOS SF`, construida con texto/CSS propio. No usa escudo, isologo oficial `SF`, imágenes municipales ni archivos binarios extraídos. El header y el footer declaran explícitamente que se trata de información hídrica independiente y un producto no gubernamental.

## Decisiones principales

1. Hidrometría sigue siendo el primer bloque operativo y conserva nivel, estación, tendencia, delta 24 h, observación, vigencia, fuente y gráfico.
2. La home adopta accesos rápidos cívicos oscuros y un banner editorial compacto de Gestión de Riesgo.
3. El chasis deja el dashboard SaaS oscuro: canvas claro, header blanco, navy institucional de referencia y superficies rectangulares de bajo radio.
4. `/gestion-de-riesgo` funciona como hub y `/gestion-de-riesgo/fenomeno-el-nino` como landing editorial propia.
5. El contenido de El Niño está parafraseado y atribuido. `5,30 m` aparece sólo como referencia territorial citada de Vuelta del Paraguayo y nunca como umbral general de SOS-SF.
6. Agendas y cifras variables no se congelan como vigentes sin verificación actual.
7. Referencias municipales capturadas se conservan sólo en artifacts de evidencia y no se publican como assets del producto.

La matriz estructurada de 51 rasgos está en `docs/municipal-reverse-matrix.json`.
