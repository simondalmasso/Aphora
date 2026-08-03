# OWNER UI + INTERNAL MESSAGING OVERRIDE 001

```text
PROJECT=SOS-SF
ORDER_ID=SOS-SF-HUMAN-ARQ-WEBAPP-V1-ONE-SHOT-001
STATUS=ACTIVE_OWNER_OVERRIDE
PRECEDENCE=THIS_FILE_OVER_CONFLICTING_UI_OR_MESSAGING_DETAILS
SCOPE=HEADER_ACTIONS_AND_INTERNAL_MESSAGING
PUBLIC_WEB_AUTH_REQUIRED=NO
AUTH_PROVIDER=GOOGLE_IDENTITY_SERVICES_DIRECT
AUTH0_REQUIRED=NO
WAIT_FOR_AUD=NO
```

ARQ debe incorporar este override dentro del tramo vigente sin detener el resto de la construcción.

## 1. Regla pública no negociable

Toda la información pública permanece abierta sin login:

- estado hídrico;
- qué cambió;
- niveles y lluvias;
- fuentes y antigüedad;
- contradicciones;
- refugios/puntos confirmados;
- acciones recomendadas;
- comunicaciones públicas;
- `/lite`;
- APIs públicas de lectura definidas en el handoff.

Nunca mostrar un login wall antes del dashboard. Nunca exigir Google para consultar información de emergencia.

## 2. Header: dos mini botones

Agregar arriba a la derecha:

1. **Actualizar** — icono de flecha circular.
2. **Mensajes** — icono de sobre.

### Diseño

- Integrados al estilo `APPLE_WHITE_LOW`.
- Sin texto visible permanente.
- SVG inline o iconos propios livianos; no añadir una librería pesada.
- Área visual aproximada de 30–34 px.
- Área táctil mínima de 44×44 px.
- Contraste AA, focus visible y estados hover/pressed discretos.
- No formar menú, toolbar compleja ni navegación secundaria.
- No provocar overflow horizontal en 360 px.

### Actualizar

- `aria-label="Actualizar estado"`.
- Actualizar snapshot, fuentes y comunicaciones sin recargar el documento completo.
- Evitar solicitudes concurrentes.
- Animación breve de flecha; respetar `prefers-reduced-motion`.
- Conservar datos anteriores si falla.
- Mostrar hora de última actualización exitosa y error no invasivo.

### Mensajes

- `aria-label="Abrir mensajes"`.
- Mostrar punto o contador compacto de no leídos.
- Mobile: bottom sheet.
- Desktop: panel/popover compacto.
- Cerrar con Escape, clic exterior y control explícito.
- Restaurar foco al botón al cerrar.

## 3. Centro de mensajes

El panel del sobre reúne dos clases claramente diferenciadas en una sola superficie, sin submenús complejos:

### A. Comunicaciones públicas

- Siempre visibles sin login.
- Read-only.
- Máximo cinco activas, ordenadas por prioridad y TTL.
- Fuente, hora, área, vigencia y tipo.
- Incluye avisos públicos, estado del sistema, contradicciones y actualizaciones de refugios.

### B. Mi bandeja privada

- Login opcional mediante Google sólo al abrir esta función o intentar enviar.
- Mensajería interna asincrónica y privada entre usuario autenticado y operadores SOS-SF verificados.
- No permitir descubrimiento de usuarios, mensajes directos entre ciudadanos, salas públicas ni grupos abiertos.
- No presentarlo como 911, despacho oficial ni canal garantizado de emergencia.
- Mostrar advertencia visible: ante peligro inmediato usar canales oficiales.

## 4. Autenticación Google

Usar Google Identity Services directamente. No introducir Auth0 en V1 salvo imposibilidad técnica demostrada.

### Reglas

- Botón oficial `Sign in with Google` dentro del panel de mensajes, no en la portada.
- No usar One Tap invasivo en el dashboard.
- Verificar el ID token en el Worker: firma/JWK, issuer, audience, expiración y `email_verified`.
- Identidad interna basada en `sub`, nunca solamente en email.
- Crear sesión propia mediante cookie `HttpOnly`, `Secure`, `SameSite=Lax`, duración limitada y revocación/cierre de sesión.
- No almacenar tokens de Google ni solicitar scopes de Gmail, Drive, contactos o perfil extendido.
- Pedir sólo identidad básica necesaria: `openid email profile`.
- No incluir Google Client Secret en frontend.
- Variables esperadas:

```text
GOOGLE_CLIENT_ID=public_configuration_value
SESSION_SIGNING_KEY=secret
SOS_SF_OPERATOR_EMAILS=secret_or_protected_configuration
```

- Si las credenciales Google no están disponibles durante este tramo, implementar y probar toda la integración detrás de una feature flag segura; desplegar la web pública sin bloquearla y documentar exactamente el único paso de activación restante. No inventar autenticación funcional.

## 5. Modelo de roles

```text
PUBLIC_ANONYMOUS
AUTHENTICATED_USER
VERIFIED_OPERATOR
ADMIN
```

- Los roles se determinan exclusivamente en servidor.
- Un usuario nunca puede autoasignarse `VERIFIED_OPERATOR` o `ADMIN`.
- Operadores inicialmente mediante allowlist protegida.
- Mostrar distintivo claro en mensajes enviados por operadores verificados.

## 6. Alcance de mensajería V1

### Requerido

- Crear conversación privada usuario ↔ equipo SOS-SF.
- Lista de conversaciones para operador.
- Lista de mensajes del usuario autenticado.
- Enviar mensajes de texto.
- Estados `SENT`, `DELIVERED_TO_SERVICE`, `READ_BY_OPERATOR`, `FAILED`, `UNKNOWN`.
- Timestamps absolutos y relativos.
- Contador de no leídos.
- Límite de longitud.
- Rate limiting.
- Validación y escape de contenido.
- Idempotency key por envío.
- TTL/retención configurable.
- Audit trail mínimo sin contenido sensible en logs.
- Paginación o límite estricto; nunca scroll infinito.
- Estados vacíos, offline y error.

### No requerido / prohibido en V1

- Archivos o imágenes.
- Audio o llamadas.
- Ubicación automática.
- Mensajes entre ciudadanos.
- Canales públicos creados por usuarios.
- Reacciones, likes, perfiles sociales o presencia pública.
- Indicadores de escritura si agregan complejidad.
- Cifrado end-to-end afirmado sin implementación auditada.
- Garantía de respuesta o despacho de emergencia.

## 7. Persistencia y tiempo real

Prioridad de implementación:

```text
1. MENSAJERIA_ASINCRONICA_CORRECTA_Y_PERSISTENTE
2. ACTUALIZACION_POR_POLLING_EFICIENTE
3. WEBSOCKET_HIBERNATION_SOLO_SI_NO_PONE_EN_RIESGO_EL_ONE_SHOT
```

Usar almacenamiento Cloudflare apropiado y consistente. Preferir una base consultable para conversaciones y mensajes; no usar KV como fuente primaria de historial conversacional si impide consultas, orden o consistencia requeridas.

Si se usa Durable Objects/WebSockets:

- Hibernation API.
- Persistir mensajes importantes; no confiar en memoria del objeto.
- Reconexión y deduplicación.
- Fallback a polling.

No bloquear la entrega completa de la web por tiempo real. Una bandeja asincrónica sólida tiene prioridad sobre un chat visualmente instantáneo pero frágil.

## 8. Contratos Zungun compatibles

Mapear mensajes privados al límite local `zungun-compat`:

- ID estable;
- conversation ID;
- sender/recipient IDs;
- createdAt/expiresAt;
- prioridad;
- status explícito `UNKNOWN`;
- idempotency key;
- commitment/provenance cuando corresponda;
- failure reason.

No afirmar delivery garantizado, receipt criptográfico, satélite ni exactly-once universal.

## 9. Seguridad y privacidad

- Autorización en cada endpoint; no confiar en datos del cliente.
- Un usuario sólo puede leer sus propias conversaciones.
- Operadores sólo mediante rol server-side.
- CSRF mitigado según el flujo de sesión.
- Content Security Policy compatible con Google Identity Services únicamente en la superficie de login.
- Sanitización y salida segura.
- Rate limit por usuario y por IP.
- No exponer emails en mensajes o APIs públicas.
- Política de retención documentada.
- Endpoint para cerrar sesión.
- No indexar rutas privadas.
- No cachear respuestas privadas en caches compartidos.

## 10. Tests mínimos adicionales

- Dashboard público carga sin autenticación.
- `/lite` sigue abierto sin autenticación.
- Abrir mensajes no fuerza login para comunicaciones públicas.
- `Mi bandeja` solicita Google sólo cuando corresponde.
- Token inválido, expirado, issuer incorrecto o audience incorrecta es rechazado.
- Usuario no puede leer conversaciones ajenas.
- Usuario no puede autoelevar rol.
- Mensaje duplicado con misma idempotency key no duplica contenido.
- Rate limiting funciona.
- Mensajes privados usan `Cache-Control: private, no-store`.
- Botones del header funcionan por teclado y en 360 px.
- Panel cierra con Escape y restaura foco.

## 11. Condición de entrega

Este override no autoriza detener el one-shot para pedir credenciales Google. ARQ debe integrar la arquitectura, UI, contratos, seguridad y tests ahora. Si falta `GOOGLE_CLIENT_ID`, dejar la activación como limitación explícita y comprobable sin degradar ni bloquear la web pública.
