# Política de seguridad

SOS Santa Fe es un repositorio público. No publiques en commits, issues, pull requests, GitHub Actions ni artifacts:

- tokens, claves, cookies, credenciales o valores de secrets;
- datos personales o reportes ciudadanos reales;
- URLs privadas con credenciales, firmas o identificadores de sesión;
- exports de D1/KV, registros de autenticación o archivos `.env` / `.dev.vars`;
- capturas que contengan cuentas, correos, ubicaciones exactas o datos privados.

## Reportar una vulnerabilidad

Usá **Security → Report a vulnerability** para enviar un informe privado cuando esa opción esté disponible. No abras un issue público para fallas que afecten autenticación, sesiones, mensajería privada, reportes, D1/KV, credenciales o configuración de producción.

Incluí el impacto, los pasos mínimos para reproducirlo, la versión o commit afectado y una mitigación sugerida. Usá datos ficticios y no incluyas credenciales reales.

## Exposición accidental

Ante una posible filtración:

1. revocá o rotá primero la credencial;
2. retirala de ramas, artifacts y logs;
3. revisá accesos y despliegues asociados;
4. coordiná cualquier reescritura de historial antes de forzar ramas públicas.

Borrar el último commit no invalida una credencial que ya fue publicada.

## Alcance

La recepción de reportes cubre la rama por defecto y la versión desplegada en producción. Los endpoints y fuentes públicas documentadas forman parte del diseño y no se consideran secretos.
