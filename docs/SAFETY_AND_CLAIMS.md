# Seguridad, privacidad y afirmaciones

- No es un servicio oficial, central de despacho ni autoridad de alerta.
- No emite órdenes algorítmicas de evacuación ni usa rumores.
- No hay chat público, feed, comentarios, grupos ni texto ciudadano visible a terceros.
- La bandeja privada opcional no reemplaza al 911 y no promete entrega, lectura, respuesta, satélite, receipts firmados ni exactly-once.
- Refugios y cifras son fixtures rotulados `DEMO / NO OFICIAL`.
- El modo offline muestra timestamp absoluto y aclara que la copia no es el estado actual.

La lectura pública no requiere cuenta. Las respuestas privadas usan `private, no-store`, `noindex` y nunca exponen email. El Worker verifica identidad y rol en cada operación; limita longitud, forma, conversación, idempotencia, tasa por usuario/IP y retención. React escapa el contenido y D1 recibe parámetros vinculados. La auditoría guarda actor, acción, objetivo y timestamp, nunca el texto.

CSP permite Google Identity Services exclusivamente en la superficie optativa de login; no hay fuentes externas, trackers ni geolocalización. `nosniff`, referrer restrictivo, Permissions Policy, CORP, COOP y frame denial se aplican desde el Worker. Los secretos permanecen en Cloudflare/GitHub Actions y no se leen, copian ni publican.
