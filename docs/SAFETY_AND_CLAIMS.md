# Seguridad y afirmaciones

- No es un servicio oficial, central de despacho ni autoridad de alerta.
- No emite órdenes algorítmicas de evacuación.
- No acepta texto ciudadano libre, cuentas, comentarios, DM ni rumores.
- No promete mensajería satelital, entrega garantizada, receipts firmados ni exactly-once.
- Refugios y cifras son fixtures rotulados `DEMO / NO OFICIAL`.
- El modo offline muestra un timestamp absoluto y aclara que la copia no es el estado actual.

La API es GET/HEAD solamente. CSP, `nosniff`, referrer restrictivo, permissions policy, CORP, COOP y frame denial se aplican desde el Worker. No hay trackers, fuentes externas, geolocalización automática ni secretos en cliente, logs o artifacts.
