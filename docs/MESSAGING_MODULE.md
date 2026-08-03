# Comunicaciones críticas y bandeja privada

## Superficie pública

La bandeja pública está siempre abierta, es sólo lectura y muestra hasta cinco mensajes ordenados por prioridad, creación e ID. Cada mensaje conserva tipo cerrado, área, fuente, `createdAt`, `expiresAt`, prioridad 0–3, estado, evidencia y provenance. El TTL es estricto; `UNKNOWN` permanece explícito. `/api/messages` declara `deliveryClaims: NONE` porque publicar una estructura no demuestra transporte ni efecto.

## Superficie privada opcional

La V1 implementa una conversación por usuario autenticado con el equipo SOS, lista acotada para operadores verificados, páginas de hasta 40 mensajes y polling cada 15 segundos. Acepta sólo texto de 1–800 caracteres. No admite archivos, audio, ubicación, grupos, reacciones, presencia, typing indicators, perfiles sociales ni descubrimiento de personas.

Google Identity Services entrega un ID token que el Worker verifica por firma RS256/JWK, issuer, audience, expiración, `sub` y `email_verified`. La identidad estable es `sub`; el email sólo decide server-side la allowlist de operadores y nunca sale en respuestas públicas. La sesión propia es `HttpOnly`, `Secure`, `SameSite=Lax`, dura ocho horas y se revoca con logout. Scopes: `openid email profile`; One Tap está deshabilitado.

Cada endpoint privado autoriza la conversación. Los envíos requieren mismo origen, JSON exacto, clave de idempotencia, rate limit por identidad y hash de IP, TTL de 30 días y auditoría sin contenido. Estados: `DELIVERED_TO_SERVICE`, `READ_BY_OPERATOR`, `FAILED` o `UNKNOWN`; ninguno garantiza atención humana. Los mensajes de operadores se distinguen sólo cuando el rol fue derivado y firmado por el servidor.

## Feature flag

La función sólo se activa cuando coinciden `PRIVATE_MESSAGING_ENABLED=true`, `GOOGLE_CLIENT_ID`, `SESSION_SIGNING_KEY` y el binding D1 `MESSAGES_DB`. En cualquier otra combinación, `/api/auth/config` lo informa y las comunicaciones públicas siguen funcionando sin login.
