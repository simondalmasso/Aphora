# Sistema visual

Dirección `APPLE_WHITE_LOW`: fondo off-white, superficies blancas, bordes suaves, jerarquía tipográfica fuerte y color reservado para estado. Usa sólo la tipografía del sistema.

La base es 360–412 px. En móvil, estado y acción aparecen en el primer viewport y la superficie completa se mantiene alrededor de tres pantallas. Desde 720 px se activa una grilla de 12 columnas refinada para 1440×900.

## Pulso del Paraná

La orden visual del 3 de agosto de 2026 reemplaza únicamente las restricciones anteriores de “sin loops ni parallax” para el hero. La página conserva `APPLE_WHITE_LOW`; dentro de ella, una tarjeta oscura concentra nivel, variación de 24 horas, tendencia, estado, estación, timestamp y acción recomendada antes de la explicación tridimensional.

- celeste: observaciones demo de las últimas 48 horas;
- ámbar/violeta: proyección demo de 24 horas y ancho de incertidumbre;
- altura: nivel/riesgo;
- cuatro planos: normal, vigilancia, alerta y evacuación, todos rotulados como demo;
- punto luminoso: momento actual;
- SVG inferior: variación horaria accesible.

La corriente, 18 partículas, pulso, morph de actualización y brillo de proximidad se ejecutan a un máximo de 30 FPS. El paralaje táctil queda acotado a ±0,08 radianes y nunca hay rotación automática. La escena se pausa fuera del viewport; `prefers-reduced-motion` produce un frame estático. Si WebGL falla, el SVG completo permanece visible.

El foco visible, landmarks, headings, texto además del color y controles nativos sostienen WCAG AA. Las frases “MÁS ALTO = MÁS RIESGO”, “CELESTE = OBSERVADO” y “ÁMBAR = PROYECCIÓN” son parte estable del contrato de comprensión.
