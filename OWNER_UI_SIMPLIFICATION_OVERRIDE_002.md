# OWNER UI SIMPLIFICATION OVERRIDE 002

```text
ORDER_ID=SOS-SF-OWNER-UI-SIMPLIFICATION-002
STATUS=ACTIVE
AUTHORIZED_BY=SIMON
SCOPE=INFORMATION_ARCHITECTURE_VISUAL_HIERARCHY_ACCESSIBILITY_PERFORMANCE_TESTS_DEPLOYMENT
EXECUTION_MODE=ONE_CONTINUOUS_RUN
```

## 1. Motivo y precedencia

La portada actual contiene demasiada información visible simultáneamente. El usuario debe leer estado, nivel, tendencia y acción recomendada en menos de tres segundos; el resto debe continuar disponible mediante divulgación progresiva.

Este archivo tiene precedencia sobre cualquier decisión previa de layout, densidad, número de tarjetas o exposición simultánea de módulos. No elimina contratos, datos, seguridad, accesibilidad, modo offline, modo lite, mensajería ni evidencia: cambia dónde y cuándo se muestran.

No copiar diseños deportivos ni identidades de terceros. Conservar el concepto original de `Pulso del Paraná` y su implementación eficiente, pero convertirlo en el centro inequívoco de la experiencia.

## 2. Objetivo de producto

La página principal debe sentirse como una herramienta pública popular, clara y visual; no como un panel técnico, expediente o dashboard administrativo.

Resultado obligatorio:

```text
FIRST_VIEWPORT=ESTADO + NIVEL + TENDENCIA + ACCION + VISUAL
VISIBLE_PRIMARY_SECTIONS_AFTER_HERO=MAX_2
DETAILS=ON_DEMAND
PUBLIC_WEB=ALWAYS_OPEN
MESSAGING_PANEL=ON_DEMAND
NO_DATA_LOSS=YES
NO_TEST_WEAKENING=YES
```

A 360–412 px, la primera pantalla debe responder inmediatamente:

1. ¿Cuál es el estado?
2. ¿Cuánto mide el río?
3. ¿Está subiendo o bajando?
4. ¿Qué tengo que hacer ahora?
5. ¿Cuándo se actualizó?

## 3. Header mínimo

Mantener sólo:

- marca `SOS Santa Fe`;
- indicador compacto de conexión, accesible pero sin ocupar una línea completa;
- botón Refresh;
- botón Mensajes con contador;
- acceso a modo lite fuera del foco principal, preferentemente en footer y menú de accesibilidad textual, sin crear hamburger complejo.

Eliminar del flujo visual principal cualquier fila redundante de:

- `En línea` como texto prominente;
- banner independiente de snapshot;
- timestamp duplicado;
- contador de mensajes fuera del icono;
- `DEMO / NO OFICIAL` repetido varias veces.

`DEMO / NO OFICIAL` debe aparecer una vez, de forma permanente y visible dentro del hero; puede repetirse sólo en contenido crítico, offline o modales donde exista riesgo real de confusión.

## 4. Hero obligatorio: Pulso del Paraná

El hero oscuro continúa siendo el elemento principal. Debe ocupar el primer viewport sin quedar desplazado por banners o textos previos.

Mostrar dentro del hero, en este orden visual:

- `Pulso del Paraná`;
- estación;
- estado: `VIGILANCIA`, `NORMAL`, `ALERTA` o equivalente demo;
- nivel actual en tamaño dominante;
- variación de 24 horas;
- tendencia;
- timestamp compacto;
- etiqueta `DEMO / NO OFICIAL`;
- visual 3D/SVG;
- acción recomendada en una frase corta;
- dos acciones máximas: `Ver evidencia` y `Compartir`.

No mostrar antes del hero:

- una tarjeta separada de estado;
- descripción extensa del escenario;
- bloque independiente de snapshot;
- bloque independiente de API verificada;
- bloque independiente de `Qué hacer ahora`.

Esos datos se integran en el hero o se mueven al detalle.

La visual conserva:

- celeste = observado;
- ámbar/violeta = proyección;
- altura = nivel/riesgo;
- ancho = incertidumbre;
- planos = umbrales demo;
- marcador luminoso = momento actual;
- lectura inferior 2D;
- Three.js con carga dinámica;
- SVG accesible como fallback;
- máximo 30 FPS;
- DPR máximo 1.5;
- sin sombras ni postprocesado;
- pausa fuera de viewport;
- reduced motion estático;
- modo lite sin WebGL.

Reducir el texto explicativo persistente de la visual a una sola leyenda compacta. No mostrar tres frases largas en filas separadas si pueden resolverse con chips o etiquetas breves.

## 5. Resumen visible debajo del hero

Después del hero sólo pueden quedar visibles, sin expansión, dos bloques principales:

### 5.1 `Lo importante ahora`

Una tarjeta compacta con máximo tres señales:

- cambio principal del río;
- lluvia o condición meteorológica principal;
- perspectiva de próximas 24 horas.

Cada señal debe tener:

- icono o indicador;
- título corto;
- un valor o una frase de una línea.

No mostrar la lista completa de cambios ni el gráfico completo de lluvia por defecto.

### 5.2 `Qué hacer ahora`

Una tarjeta breve con:

- una recomendación principal;
- máximo dos pasos concretos;
- aviso oficial/no oficial cuando corresponda.

No listar puntos ficticios o refugios cuando `activeCount=0`. En ese caso, ocultar completamente la lista de ubicaciones. Los puntos demo sólo aparecen dentro de detalle expandido y con advertencia inequívoca.

## 6. Contenido bajo demanda

Toda la información restante debe seguir disponible, pero no abierta simultáneamente.

Usar componentes accesibles de divulgación progresiva (`details/summary`, modal o panel), sin depender exclusivamente de color y con navegación por teclado.

### `Ver evidencia`

El botón accesible debe llamarse exactamente `Ver evidencia` y abrir el diálogo `Fuentes y vigencia`.

Este requisito corrige el fallo del run `Deploy Workers #7`, donde el botón se renombró a `Detalle` y el test E2E legítimamente falló. No cambiar ni relajar el test para aceptar `Detalle`.

El modal contiene:

- fuentes completas;
- timestamps;
- frescura;
- contribución;
- contradicciones;
- explicación de incertidumbre;
- estado de API cuando sea relevante.

### `Más información`

Un único bloque compacto de expansión puede contener:

- lista completa de cambios;
- gráfico detallado de lluvia;
- perspectiva completa;
- señales en tensión;
- puntos demo y refugios, sólo si el usuario los solicita;
- información técnica secundaria.

No crear seis acordeones consecutivos ni replicar el dashboard anterior dentro de un acordeón. Agrupar y editar.

### Mensajes

La lista completa de comunicaciones sale del flujo principal. Se accede únicamente desde el botón de sobre en el header.

Conservar:

- mensajes públicos sin login;
- contador de no leídos;
- panel accesible;
- bandeja privada desactivada de forma segura hasta configurar Google Identity Services y D1.

No mostrar simultáneamente el panel y una tarjeta completa de `Comunicaciones críticas` en la portada.

## 7. Eliminaciones y fusiones obligatorias

Eliminar como tarjetas independientes de la home:

- `Qué cambió` con lista extensa;
- `Lluvia acumulada` con gráfico completo;
- `Fuentes` con lista completa;
- `Señales en tensión` completa;
- `Comunicaciones críticas` completa;
- `Refugios y encuentro` cuando no hay activos;
- snapshot/API como módulos separados.

No eliminar los datos ni endpoints. Fusionarlos en el hero, el resumen o los detalles bajo demanda.

Eliminar jerga visible para público general:

- `Provenance visible`;
- `Read-only · prioridad + TTL`;
- `Incertidumbre preservada` como eyebrow técnico;
- IDs internos de fuente en la lectura principal;
- estados de infraestructura que no cambian la decisión del usuario.

Estos conceptos pueden mantenerse en modal técnico, documentación y API.

## 8. Copy y densidad

Reglas de copy:

- títulos de 2–5 palabras;
- párrafos de máximo 140 caracteres en la vista principal;
- máximo una oración explicativa por bloque visible;
- no repetir la misma advertencia en hero, tarjeta, sección y footer;
- valores antes que explicación;
- lenguaje ciudadano, no lenguaje de arquitectura.

La portada móvil completa, antes de abrir detalles, debe quedar aproximadamente entre 1.5 y 2.5 pantallas, no seis o más.

No ocultar información crítica sólo para reducir altura. La jerarquía correcta es:

```text
CRITICO_VISIBLE
IMPORTANTE_RESUMIDO
SECUNDARIO_BAJO_DEMANDA
TECNICO_EN_EVIDENCIA_O_DOCS
```

## 9. Accesibilidad

Conservar o mejorar:

- landmarks;
- jerarquía de headings;
- foco visible;
- cierre con Escape;
- retorno de foco al disparador;
- nombres accesibles estables;
- reduced motion;
- lectura sin WebGL;
- contraste AA;
- soporte de teclado y lector de pantalla.

El texto `Saltar al estado actual` continúa disponible como skip link, pero visualmente oculto hasta recibir foco. No debe aparecer como contenido ordinario.

## 10. Tests obligatorios

No relajar, eliminar ni convertir fallos en skips para obtener verde.

Corregir la UI y mantener el test existente:

```text
source details use an accessible modal and keyboard close
```

El test debe encontrar `Ver evidencia`, abrir `Fuentes y vigencia`, cerrar con Escape y comprobar retorno de foco cuando corresponda.

Agregar o actualizar E2E para probar:

1. hero visible en primera pantalla móvil;
2. estado, nivel, tendencia y acción dentro del primer viewport;
3. ausencia de overflow horizontal;
4. máximo dos secciones principales abiertas después del hero;
5. fuentes completas no visibles hasta `Ver evidencia`;
6. comunicaciones completas no visibles hasta abrir el sobre;
7. lista de refugios oculta cuando no hay activos;
8. `Más información` expande y contrae por teclado;
9. fallback SVG y reduced motion siguen funcionando;
10. offline shell permanece explícito y útil;
11. modo lite sigue textual, read-only y sin scripts.

Mantener:

- typecheck;
- lint;
- unitarios;
- contratos;
- build y presupuestos;
- E2E desktop/mobile;
- screenshots desktop/mobile;
- Wrangler dry-run;
- verificación remota.

## 11. Rendimiento

No aumentar el presupuesto inicial por el rediseño de densidad.

Objetivos:

```text
INITIAL_JS_GZIP<=122880
LAZY_VISUAL_JS_GZIP<=184320
CSS_GZIP<=25600
THREE_DYNAMIC_IMPORT=YES
EXTERNAL_FONTS=NO
TRACKERS=NO
```

No agregar librerías de UI para resolver acordeones, modales o iconos simples.

## 12. Ejecución GitHub y deployment autónomo

Ejecutar como un único tramo continuo:

```text
READ_AUTHORITIES
→ INSPECT_CURRENT_MAIN
→ IMPLEMENT_SIMPLIFICATION
→ UPDATE_TESTS_WITHOUT_WEAKENING
→ LOCAL_TYPECHECK_LINT_UNIT_CONTRACT_BUILD
→ COMMIT_AND_PUSH
→ RUN_GITHUB_ACTIONS
→ FIX_AND_REPEAT_UNTIL_GREEN
→ DEPLOY_WORKERS
→ VERIFY_REMOTE
→ CAPTURE_SCREENSHOTS
→ REMOVE_TRANSIENT_TRIGGER
→ FINAL_COMMIT_AND_PUSH
→ PUBLISH_CHECKPOINT
→ STOP
```

El workflow final debe quedar únicamente con `workflow_dispatch`.

Si el entorno de ARQ no puede disparar manualmente Actions por falta de sesión, se autoriza temporalmente:

- crear una rama exacta `arq/ui-simplification-v2`;
- habilitar `push` sólo para esa rama;
- ejecutar el tramo y deployment;
- retirar el trigger transitorio inmediatamente después del primer run verde;
- dejar el workflow final otra vez en `workflow_dispatch` únicamente;
- no usar cron;
- no dejar deployments repetitivos.

Consumir secretos sólo mediante GitHub Actions. No leerlos, imprimirlos ni pedirlos.

## 13. Criterio de cierre

No declarar finalización sin:

- SHA remoto final;
- run de Actions verde;
- test del modal corregido en desktop y mobile;
- E2E de jerarquía/densidad verde;
- deployment Cloudflare verificado;
- `/`, `/lite`, `/api/health`, `/api/snapshot` y manifest verificados;
- capturas desktop/mobile nuevas;
- artifact con digest;
- workflow final `workflow_dispatch` only;
- checkpoint auditable;
- limitaciones declaradas;
- `AUD_READY=YES`;
- `STOP=TRUE`.

Formato final mínimo:

```text
ORDER_ID=SOS-SF-OWNER-UI-SIMPLIFICATION-002
STATUS=COMPLETE
REMOTE_HEAD_SHA=
DEPLOYMENT_SOURCE_SHA=
GITHUB_ACTIONS_RUN=
DEPLOYMENT_URL=
TYPECHECK=
LINT=
UNIT_TESTS=
CONTRACT_TESTS=
E2E_TESTS=
MODAL_ACCESSIBILITY_TEST=
FIRST_VIEWPORT_HIERARCHY_TEST=
OFFLINE_SHELL_E2E=
WORKFLOW_FINAL_TRIGGER=workflow_dispatch_ONLY
ARTIFACT_ID=
ARTIFACT_DIGEST=
CHECKPOINT_URL=
KNOWN_LIMITATIONS=
AUD_READY=YES
STOP=TRUE
```
