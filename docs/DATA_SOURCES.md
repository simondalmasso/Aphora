# Fuentes, vigencia y metodología

`CURRENT_DATA_MODE=LIVE_PUBLIC_SOURCES`.

El inventario se publica en `/api/sources` con dos niveles: organismo y feed. Varios transportes de un mismo organismo no cuentan como corroboraciones independientes.

## Inventario inicial

| Organismo | Feed o canal | Rol | Clasificación esperada |
|---|---|---|---|
| Instituto Nacional del Agua | INA REST · Paraná, Santa Fe | medición principal | `OPERATIONAL_FRESH` o `OPERATIONAL_STALE` |
| Instituto Nacional del Agua | INA REST · Salado, Santo Tomé | medición principal | `OPERATIONAL_FRESH` o `OPERATIONAL_STALE` |
| Instituto Nacional del Agua | INA WaterML · Paraná | transporte alternativo | `OPERATIONAL_FRESH`, `OPERATIONAL_STALE` o `DEGRADED` |
| Instituto Nacional del Agua | INA WaterML · Salado | transporte alternativo | `OPERATIONAL_FRESH`, `OPERATIONAL_STALE` o `DEGRADED` |
| Servicio Meteorológico Nacional | alertas CAP | alerta oficial principal | `OPERATIONAL_FRESH`, `OPERATIONAL_STALE` o `DEGRADED` |
| Servicio Meteorológico Nacional | observaciones meteorológicas | contexto | `BLOCKED_CREDENTIAL` mientras no exista credencial oficial |
| NASA | GPM IMERG Early | señal suplementaria | `SUPPLEMENTARY` sólo con muestra local válida |
| Agencia Nacional de Puertos y Navegación | hidrómetros | contexto | `BLOCKED_NO_MACHINE_ENDPOINT` sin endpoint estable |
| Provincia de Santa Fe · Protección Civil | canal humano de alerta temprana | verificación | `BLOCKED_NO_MACHINE_ENDPOINT` |
| Municipalidad de Santa Fe · COBEM | canal humano de gestión de riesgo | verificación y contactos | `BLOCKED_NO_MACHINE_ENDPOINT` |

## Contratos de vigencia

Las mediciones hidrométricas se clasifican según la antigüedad de `observedAt`:

- `ACTUALIZADO`: hasta 6 horas;
- `ACTUALIZACION_DEMORADA`: más de 6 y hasta 24 horas;
- `DESACTUALIZADO`: más de 24 horas;
- `NO_DISPONIBLE`: sin timestamp o valor utilizable.

El feed CAP usa una ventana más estricta: hasta 30 minutos actualizado y hasta 12 horas como vigencia degradada. El cache conserva el timestamp original; nunca renueva artificialmente la observación.

## Reglas de seguridad comunicacional

- `generatedAt` es la generación del snapshot, no la medición.
- Una fuente bloqueada no se cuenta como conectada.
- Una fuente suplementaria no determina el estado principal.
- Una alerta vencida o cancelada no permanece activa.
- Un umbral instrumental no produce una orden oficial.
- No se extraen tokens desde HTML, no se elude autenticación y no se presenta scraping frágil como integración estable.
