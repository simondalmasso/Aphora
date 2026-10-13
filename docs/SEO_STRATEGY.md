# Estrategia SEO de APHORA

**Objetivo:** mejorar el descubrimiento orgánico de APHORA como radar cívico de riesgos en Argentina, sin exagerar capacidades ni confundir observaciones con alertas oficiales.

## 1. Posicionamiento e intención

Priorizar consultas que coincidan con la utilidad real del producto:

- radar de riesgos Argentina
- mapa de riesgos en Argentina
- alertas meteorológicas Argentina
- eventos sísmicos Argentina
- observaciones hidrológicas y niveles de ríos
- monitoreo de inundaciones e incendios
- datos públicos de riesgos y desastres
- civic risk radar / Argentina hazard monitoring

Acompañar la marca APHORA de términos descriptivos. No usar keywords irrelevantes, listas repetitivas ni afirmar “alerta oficial” para información observacional o complementaria.

## 2. SEO técnico

- Título de página descriptivo: “APHORA · Radar cívico de riesgo en Argentina”.
- Descripción concisa en español de Argentina.
- URL canónica absoluta hacia la aplicación desplegada.
- Open Graph y Twitter Card para vistas previas al compartir.
- `robots.txt` permite rastrear recursos públicos y referencia el sitemap.
- `sitemap.xml` declara únicamente la URL pública principal.
- README orientado a usuarios y desarrolladores, con descripción, fuentes, arquitectura y comandos de prueba.
- Enlaces claros entre producción, repositorio canónico y espejo heredado.

## 3. Contenido y confianza

La interfaz y la documentación deben explicar quién publica cada dato, cuándo fue observado o actualizado, si se trata de alerta/observación/dato complementario y qué limitaciones tiene la fuente. “Sin datos” no significa “sin riesgo”.

Crear páginas indexables adicionales sólo cuando aporten contenido único y mantenible. No generar páginas por localidad con contenido duplicado o datos vacíos. No publicar datos personales ni información operativa sensible.

## 4. Metadatos externos del repositorio

Descripción propuesta para GitHub:

> Civic risk radar for Argentina: explore hazards, public observations and source-verified evidence in a progressive web app.

Topics sugeridos: `argentina`, `risk-monitoring`, `disaster-management`, `early-warning`, `weather-alerts`, `flood-monitoring`, `earthquake-monitoring`, `civic-tech`, `progressive-web-app`, `cloudflare-workers`, `open-data`, `situational-awareness`.

Añadir sólo topics que describan funciones reales; evitar sugerir que APHORA es un sistema certificado de emergencia o un proveedor oficial de alertas. La descripción y los topics deben guardarse en GitHub → About → Edit repository details y comprobarse después. No basta con documentarlos aquí.

## 5. Indexación y medición

1. Comprobar título, descripción, canonical y vista previa social en producción.
2. Comprobar `/robots.txt` y `/sitemap.xml` en el dominio público.
3. Registrar el dominio en Google Search Console y Bing Webmaster Tools si el propietario desea utilizar esos servicios.
4. Enviar el sitemap y revisar cobertura, canonical seleccionada, errores de rastreo y consultas reales.
5. Medir impresiones, clics, CTR y posición por consultas de marca y no relacionadas con la marca.
6. Revisar mensualmente títulos, snippets, rendimiento móvil, enlaces rotos y disponibilidad de fuentes.
7. No declarar indexación ni mejoras de ranking sin datos verificables.

## 6. Criterios de aceptación

- [ ] README describe la aplicación real y no contiene texto de plantilla.
- [ ] Canonical apunta a la URL de producción elegida.
- [ ] Robots y sitemap responden correctamente en producción.
- [ ] Las vistas previas sociales muestran título y descripción adecuados.
- [ ] Descripción y topics de GitHub guardados y comprobados manualmente.
- [ ] GitLab sigue siendo un espejo de GitHub.
- [ ] `npm run gate` pasa.
- [ ] La producción se verifica después de un despliegue aprobado.

## 7. Límites

Los metadatos no garantizan indexación ni rankings. Los buscadores deciden cuándo rastrear, indexar y mostrar resultados. El sitemap no fuerza la indexación. No se incluyen meta keywords porque los principales buscadores no las usan como factor de posicionamiento.
