# Referencias de diseño hidrométrico

Origen: orden 019; revalidado durante el cierre 020.

This matrix records the product patterns reviewed before implementation. It does not claim that third-party models are official local measurements.

| Reference | Observed pattern | Adopted decision | Discarded decision | Reason |
|---|---|---|---|---|
| Google Flood Hub | Place/gauge selection, compact location panel, confidence/model layers and forecast context are visually primary. | Station selector, dominant gauge reading, chart-first composition and explicit source role. | Showing Flood Hub output as a Santa Fe gauge measurement. | Model output is supplementary and cannot replace a local official observation. |
| RiverApp | Station first; current level and graph are immediately available; thresholds and favorites do not dominate the opening screen. | Paraná/Salado segmented control, 56–80 px mobile level and direct chart interaction. | A global station browser and account/favorites system. | Outside the bounded Santa Fe emergency-information product. |
| Watch Duty Floods | Verified incidents, follow-up information and preparation are distinct; map/gauges remain actionable. | Verified active alert may be one compact priority band; failed verification is only a header badge and detail dialog. | Treating unverified reports as an incident or alert. | Would conflate monitoring with confirmed public-safety information. |
| Bureau of Meteorology Australia | Current river conditions, warnings and rainfall are connected but separated; station plots and tables are direct. | Four bounded surfaces: hydrometry, territory, essential actions, source health. | A large national-map navigation shell. | The product is local and must stay within mobile scroll budgets. |

## Official evidence reviewed

- Google Flood Hub Help: map, layers, gauge panel, forecasts and confidence distinctions.
- RiverApp official product pages: real-time station levels, graphs and alerts.
- Watch Duty official flooding feature documentation: flood incidents, gauges and alert separation.
- Australian Bureau of Meteorology flood and river-condition pages: station-level maps, tables, plots and warnings.
- Instituto Nacional del Agua REST and WaterOneFlow/WaterML documentation.
- Santa Fe Civil Protection early-warning channel.
- Servicio Meteorológico Nacional alert channel.

## Information architecture

1. **Situación hidrométrica** — selector, station identity, large observed level, freshness, trend, 24-hour delta, observation/receipt, source and interactive chart.
2. **Contexto territorial** — compact Paraná/Salado schematic and rainfall availability.
3. **Alertas y acciones** — verified-alert access and emergency telephone actions; reporting remains collapsed.
4. **Fuentes y transparencia** — health by source family, receipt age, limitations and full traceability dialog.

## ROAST: before / after

| Dimension | Rejected baseline | 019 rebuild |
|---|---|---|
| First screen | Alert text and general summary before river data | Hydrometry begins directly below the header unless a verified active alert exists |
| Data hierarchy | Similar white cards with repeated headings | One dark hydrometric instrument surface; functionally distinct secondary surfaces |
| Level | Normal dashboard metric | Dominant 56–80 px mobile reading |
| Chart | Arrived after multiple blocks | Begins in the first mobile viewport |
| Alert failure | Full content block | Compact header badge plus accessible dialog |
| Sources | Nominal source label | Organization, feed family, observation/receipt, age, state, limitation and corroboration |
| Scroll | Long stacked report | Four bounded primary sections with explicit viewport budgets |
| Accessibility | Existing semantics with visible-skip-link complaint | Skip link transformed off-canvas until focus; keyboard chart and dialogs preserved |

Acceptance remains reserved to AUD and the owner.
