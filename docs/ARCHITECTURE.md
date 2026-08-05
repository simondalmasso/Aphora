# Arquitectura de seguridad pública

SOS Santa Fe es una PWA mobile-first servida por un Cloudflare Worker. La lectura pública no requiere cuenta. El Worker agrega fuentes allowlisted, normaliza vigencia y alertas, publica contratos JSON y aplica headers de seguridad también a assets y modo lite.

## Capas

- `worker/providers`: adaptadores con allowlist, timeout, tamaño máximo, validación de content type, cache, circuit breaker y timestamps preservados.
- `domain/public-safety`: frescura, clasificación de feeds, verificación de alertas y timeline de 72 horas.
- `worker/live-data`: inventario de organismos/feeds, estaciones reales, CAP, señales suplementarias y estado técnico separado.
- `client`: alertas primero, síntesis territorial, hidrometría, timeline, acciones, preparación y transparencia.
- `worker/reports` + D1 + KV: reportes ciudadanos privados y fotos con TTL.
- `service-worker`: shell offline, contactos y guía; nunca presenta datos cacheados como actuales.

## Rendimiento y accesibilidad

No existe Three.js, canvas decorativo, vídeo, tracker ni fuente externa. Los gráficos hidrométricos son SVG con escala, unidad, periodo, discontinuidades y tabla equivalente. El diseño usa system-ui, base clara, una sola cabecera, controles de 44 px, reflow, zoom 200 %, reduced motion, navegación por teclado y estados que no dependen sólo del color.

## Degradación

El Worker operativo no implica datos vigentes. Cuando la fuente de alertas está caída o vencida, la portada muestra degradación o indisponibilidad; nunca afirma ausencia de alertas. Cuando no existen geometrías verificadas, el mapa se reemplaza por una lista territorial accesible y una explicación explícita.
