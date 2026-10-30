# Hydrogen Pipeline Techno-Economic Workbench

A static, browser-only screening calculator for hydrogen pipeline route feasibility, levelised transport cost, compression duty, energy penalty and line inventory.

Open `index.html` in a browser, or see the GitHub Pages site for this repository.

## Files

- `index.html`: layout and styles.
- `model.js`: calculation (no DOM), so it can be tested separately.
- `app.js`: wiring, charts, map and checks.

## What it models

- Dedicated hydrogen pipeline, steady state, Darcy-Weisbach with Colebrook friction.
- Compressor stations every spacing interval, each raising pressure from outlet back to inlet.
- CAPEX scaled with diameter; annualised with CRF; fixed OPEX and compressor electricity.
- Routine leakage per 1000 km (reduces delivered energy only).

## What it does not model

Transient flow, elevation, fittings, impurities, fatigue life, repurposed-pipeline derating, and accidental buried-pipeline release. Results are screening estimates, not a design basis.

## Checks

With the default inputs (Rotterdam Maasvlakte to Geleen, DN800, 1,000 MW, 167 km) the model gives: delivered 999.7 MW, compression 11.85 MW, penalty 1.2%, CAPEX EUR 431.7m, levelised cost EUR 0.24/kg, and break-even about 1,390 km. The hydraulic capacity is 6,380 MW against 6,032 MW in the reference workbench; the difference is in the efficiency treatment of the allowable pressure drop.

## Dependencies (loaded from CDN)

- Leaflet 1.9.4 (map)
- Chart.js 4.4.1 (charts)
- OpenStreetMap tiles (map background)
- Inter (Google Fonts)

## Author

Shreyas Kadu
