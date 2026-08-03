# Fuentes de datos

`CURRENT_DATA_MODE=DEMO_FIXTURES`. La V1 no consume ni atribuye cifras a INA, SMN, Municipalidad, Provincia, Google u otra entidad real.

Cada fuente incluye ID estable, tipo, timestamp observado, vigencia, estado de frescura, aporte y bandera de oficialidad. Los nombres `Estación demo`, `Pluviómetro demo`, `Modelo demo` y `Autoridad demo` son inequívocamente ficticios.

`river.points` contiene 13 observaciones demo ordenadas dentro de una ventana de 48 horas. `river.forecastPoints` contiene siete puntos demo dentro de 24 horas; cada valor central queda entre `lowMetres` y `highMetres`. `river.thresholds` contiene cuatro planos ficticios estrictamente ascendentes. La validación rechaza cronologías inválidas, intervalos invertidos y ventanas mayores.

La incorporación futura de una fuente real requiere contrato público, atribución verificable, política de expiración, manejo `UNKNOWN`, revisión legal y pruebas de contradicción.
