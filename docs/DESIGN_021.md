# SOS-SF 021 — diseño final

Orden: `SOS-SF-AUD-DESIGN-REBUILD-021`.

## Matriz de referencias

| Referencia | Patrón útil | Adoptado | Rechazado | Motivo |
|---|---|---|---|---|
| Google Flood Hub | La lectura por lugar y el estado hídrico dominan; mapa y tendencia apoyan la decisión. | Jerarquía station → nivel → vigencia → tendencia → fuente; contexto territorial secundario. | Presentar modelos de Google como medición oficial local. | SOS-SF conserva INA como fuente hidrométrica oficial primaria. |
| RiverApp | Estación, valor y serie histórica se entienden sin atravesar texto introductorio. | Selector Paraná/Salado inmediato, cifra dominante y gráfico en primer viewport. | Navegador global de estaciones, favoritos y cuenta como foco. | El producto es local y de emergencia pública. |
| Watch Duty Floods | Incidentes verificados y gauges se distinguen de estados no verificados. | Banda compacta sólo para alerta oficial activa; degradación de alertas queda en badge secundario. | Convertir fallas de verificación en error global. | La hidrometría útil debe sobrevivir a providers secundarios degradados. |
| Bureau of Meteorology Australia | Condición actual, warnings y series se separan semánticamente. | Superficies diferenciadas para hidrometría, territorio, acciones y transparencia. | Arquitectura nacional o navegación cartográfica extensa. | SOS-SF tiene alcance Santa Fe y presupuesto estricto de scroll. |
| Financial Times / Reuters data-viz | Alta densidad, tipografía sobria, color reservado a estado y dato. | Paleta austera, divisores finos, cifra/tabular como ancla, mínimo ornamento. | Cards decorativas, glassmorphism, gradientes y color como decoración. | La confianza depende de lectura rápida y procedencia, no de efectos. |

## Decisión visual 021

- Fondo casi negro sólido; se elimina la atmósfera de gradientes del baseline.
- Hero hidrométrico tratado como instrumento continuo, no como una pila de tarjetas.
- Cifra de nivel con escala editorial y unidad visualmente subordinada.
- Tendencia y delta 24 h forman una banda métrica lateral, con divisores en vez de contenedores.
- Fuente y recepción quedan en una línea de procedencia inmediatamente previa al gráfico.
- Gráfico gana contraste estructural y pierde efectos decorativos.
- Módulos secundarios pasan a papel claro de alta legibilidad para crear separación funcional inequívoca.
- Mobile comprime sólo información secundaria; nunca oculta estación, nivel, vigencia, fuente o gráfico.

## Invariantes preservadas

No se cambia ningún contrato de datos, fuente, alerta, autenticación, D1/KV, PWA, offline, validación de snapshot ni optional URL contract. La 021 es una transformación de presentación sobre la baseline técnica 020-B.

## Fuentes de investigación revalidadas

- Google Flood Hub Help: visualización de tendencias, pronósticos y mapa.
- Watch Duty Support, Flooding Access and Features, actualizado en 2026: incidentes de inundación y river gauges.
- RiverApp: lectura de estaciones, niveles y series.
- Bureau of Meteorology Australia: river conditions, warnings y data presentation.

La aceptación continúa reservada a AUD y OWNER.
