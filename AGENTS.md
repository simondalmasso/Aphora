# SOS-SF Agent Instructions

Este repositorio usa construcción doble agéntica.

1. Leer `RULES_SOS_SF.md`, `SECURITY.md`, `README.md` y la orden remota vigente antes de mutar.
2. La autoridad canónica de cada tramo es el issue u orden explícita más reciente; no conservar órdenes históricas como autoridad activa dentro del árbol.
3. ARQ ejecuta el tramo autorizado completo, publica evidencia remota y no se autopromueve ni se autoacepta.
4. AUD decide aceptación, bloqueo o corrección sobre SHA, runs, artifacts y producción verificables.
5. `main` sólo puede modificarse con autorización explícita. Sin autorización: rama canónica, fast-forward, sin force-push y sin PR implícito.
6. Los secretos existen únicamente en superficies protegidas. No leerlos, imprimirlos, persistirlos ni incluirlos en artifacts.
7. Cloudflare Workers, D1 Free y KV Free son los únicos recursos productivos autorizados. R2, servicios pagos y facturación están prohibidos.
8. Todo mecanismo temporal de CI/deploy debe ser único, acotado, fail-closed, deshabilitado y eliminado al cerrar el tramo.
9. No declarar datos vigentes, ausencia de alertas, seguridad ni órdenes oficiales sin evidencia y semántica temporal suficiente.
10. La evidencia visual debe comprobar estados semánticos antes de capturar y debe detectar colisiones por hash.
