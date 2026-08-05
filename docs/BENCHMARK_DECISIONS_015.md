# Benchmark de seguridad pública — orden 015

SOS Santa Fe toma patrones funcionales verificables de productos de seguridad pública reconocidos, sin copiar marcas, identidad, ilustraciones, mapas, código ni estructura visual propietaria.

| Referente | Patrón adoptado | Aplicación en SOS Santa Fe | Límite explícito |
| --- | --- | --- | --- |
| FEMA App | Separación entre preparación, protección y recuperación; lenguaje orientado a acciones; contenido útil sin conexión | Secciones progresivas “Antes”, “Durante” y “Después”; contactos y recomendaciones generales precargadas | No se imita la marca federal ni se presentan refugios sin fuente local vigente |
| Hazards Near Me NSW | Situación territorial antes que métricas; mapa y lista equivalentes; cambios de estado | Bloque territorial con estaciones verificadas, lista accesible y timeline de 72 horas | No se dibujan polígonos ni incidentes sin geometría oficial válida |
| DisasterAWARE / PDC | Modelo multiamenaza, capas y procedencia independientes | Contrato de fuentes por organismo/feed, alertas CAP, observaciones hidrométricas y capas suplementarias separadas | No se mezclan transportes del mismo organismo como corroboraciones independientes |
| NERV Disaster Prevention | Prioridad por urgencia, ubicación y antigüedad; panel que se reordena; privacidad | Alerta oficial primero, vigencia prominente, timeline, geolocalización sólo tras acción y consentimiento | No se reproduce su lenguaje visual ni su sistema de notificaciones |
| Watch Duty | Feed cronológico verificado; mapa operativo; separación oficial/editorial/ciudadana | Timeline, estados oficiales, observaciones instrumentales y reportes ciudadanos visualmente separados | Un reporte ciudadano jamás modifica automáticamente el estado público |

## Decisiones resultantes

1. La primera superficie responde: alerta, área, momento, acción y fuente.
2. El estado técnico del Worker aparece al final y nunca equivale a vigencia o seguridad.
3. La ausencia de alertas sólo se comunica si el canal automático relevante está vigente.
4. Cada medición muestra `observedAt`, `fetchedAt`, `validUntil` y antigüedad por separado.
5. Los umbrales son referencias numéricas, no órdenes de evacuación.
6. La vista territorial se degrada a una lista accesible cuando no existen geometrías verificadas.
7. Preparación y recuperación usan progressive disclosure; no compiten con la alerta en portada.
8. La identidad es cívica e independiente: sin escudos, sellos ni afirmación de pertenencia gubernamental.
