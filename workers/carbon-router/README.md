# Carbon Router

**DPID:** DPID-ECO-CAR-001  
**Port:** 3082  
**Ecosystem:** PULSE

Carbon-aware traffic routing for the Trancendos Universe. Routes requests to the data centre/edge node with the lowest carbon intensity at the current time.

## Carbon Zones

| Zone | Intensity | Renewable | Examples |
|------|-----------|-----------|---------|
| 🟢 GREEN | < 50 gCO2/kWh | > 80% | Nordic, Cloudflare Workers |
| 🟡 AMBER | 50-200 gCO2/kWh | 40-80% | EU West, US West |
| 🔴 RED | > 200 gCO2/kWh | < 40% | Singapore, Coal-heavy regions |

## Routing Strategies

- **GREENEST** — Always route to lowest carbon intensity
- **BALANCED** — Balance carbon savings with latency
- **PERFORMANCE** — Prioritise latency, with carbon as secondary criterion

## Certifications

- ISO 14001 Environmental Management
- Green Web Foundation verified
- Cloudflare Carbon Zero programme
