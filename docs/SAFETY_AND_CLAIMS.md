# Seguridad, privacidad y afirmaciones

- SOS Santa Fe es independiente y no se presenta como sitio oficial.
- No usa escudos, sellos ni marcas gubernamentales.
- No emite órdenes algorítmicas de evacuación.
- Un umbral de referencia no equivale a una instrucción de una autoridad.
- No se usan “seguro”, “todo normal”, “fuera de peligro” ni “en tiempo real” sin contrato verificable.
- La ausencia de alertas sólo se comunica con el feed relevante vigente.
- El modo offline no afirma actualización ni ausencia de alertas.

La lectura pública no requiere cuenta. Las funciones privadas usan CSP, CSRF, cookies seguras, autorización por sesión y rol, respuestas `private, no-store`, rate limits e idempotencia. Las fotos se recodifican a JPEG, se les elimina metadata y se guardan como binario privado en Workers KV Free con metadata de control y TTL; D1 conserva la metadata y auditoría. El agotamiento de cuota falla cerrado y nunca sugiere un upgrade.

La ubicación exacta sólo se incluye con consentimiento explícito en un reporte. Un reporte ciudadano queda separado de alertas y observaciones instrumentales, pasa por revisión y no modifica automáticamente el estado público.
