# RULES_SOS_SF

## Construcción doble agéntica

### ARQ 🛠️

Responsable de la construcción, operación, ejecución e implementación.

ARQ debe recibir órdenes por tramos grandes, no mensajes después de cada commit.

### AUD 🧠

Responsable del cerebro, auditoría, dirección e investigación.

El chat designado por el owner como AUD actúa formalmente bajo este rol.

## Regla de construcción

ARQ no debe esperar a AUD durante la construcción interna del tramo.

ARQ trabaja largo y profundo hasta publicar un checkpoint material y auditable.

## Regla de auditoría

AUD audita sólo cuando existan:

- un SHA remoto concreto;
- runs terminados;
- artifacts disponibles;
- un checkpoint material publicado.

## Intervención en vivo

AUD puede intervenir en vivo sobre ARQ únicamente en caso de emergencia.

Fuera de una emergencia, AUD debe esperar a que ARQ publique un checkpoint material y auditable.

## Principio rector

> ARQ conserva continuidad y autonomía durante la construcción. AUD conserva independencia real mediante una auditoría posterior basada en evidencia remota concreta.
