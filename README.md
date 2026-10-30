# UK Hydrogen Pipeline Techno-Economic Workbench

A static, browser-only screening calculator for hydrogen pipeline route feasibility, levelised transport cost (GBP/kg), compression duty, energy penalty and line inventory for UK corridors (Teesside, HyNet, Humber, Milford Haven, Grangemouth, London).

Currency is GBP. Cost inputs are placeholders; replace them with current UK sources before use.

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

- The calculation was re-derived independently in Python (NIST properties via CoolProp, Colebrook via a root finder). The JavaScript agrees to about 0.1%.
- Fluid constants follow NIST: Z = 1.04, viscosity 8.76 µPa·s, cp 14.45 kJ/kg·K, k = 1.417, LHV 119.96 MJ/kg.
- Electricity default: DESNZ Energy Trends, Q4 2025, manufacturing 16.8p/kWh (excluding CCL).
- Reference case (Rotterdam–Geleen, DN800, 1,000 MW, 167 km, EUR inputs as first published): compression 12.1 MW, penalty 1.25%, CAPEX EUR 432m, LCO EUR 0.24/kg. The hydraulic capacity is about 6,300 MW, not the 6,032 MW shown in the earlier reference.
- Compression is sized from the imposed pressure ratio. The NETL default pressures (69 to 49 bar, 85% efficiency) would cut compression to about 8.5 MW for the UK case. Choose pressures deliberately.

## Dependencies (loaded from CDN)

- Leaflet 1.9.4 (map)
- Chart.js 4.4.1 (charts)
- OpenStreetMap tiles (map background)
- Inter (Google Fonts)

## Author

Shreyas Kadu
