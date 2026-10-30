# UK Hydrogen Pipeline Techno-Economic Workbench

A static, browser-only screening calculator for hydrogen pipeline route feasibility, levelised transport cost (GBP/kg), compression duty, energy penalty and line inventory for UK corridors (Teesside, HyNet, Humber, Milford Haven, Grangemouth, London).

Currency is GBP. Compressor and threshold inputs are still placeholders; see the sources table before use.

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

- The calculation was re-derived independently in Python (NIST properties via CoolProp, Colebrook via a root finder). The JavaScript agrees to about 0.1% when both use the same constants.
- Fluid constants follow NIST: Z = 1.04, viscosity 8.76 µPa·s, cp 14.45 kJ/kg·K, k = 1.417, LHV 119.96 MJ/kg.
- UK default (Teesside to London, 354 km, DN800, 1,000 MW, 7%, £168/MWh, pipeline CAPEX £3.98m/km at DN800 in 2026 money): compression 24.3 MW, penalty 2.5%, CAPEX £1,435m, levelised cost £0.87/kg, net 236 kt/yr, break-even about 800 km at a £2.00/kg threshold.
- Reference case (Rotterdam–Geleen, DN800, 1,000 MW, 167 km, EUR inputs as first published): compression 12.1 MW, penalty 1.25%, CAPEX EUR 432m, LCO EUR 0.24/kg. The hydraulic capacity is about 6,300 MW, not the 6,032 MW shown in the earlier reference.
- Compression is sized from the imposed pressure ratio. The NETL default pressures (69 to 49 bar, 85% efficiency) would cut compression to about 8.5 MW for the UK case. Choose pressures deliberately.

## Sources and yearly review

Every input that drives the answer is listed here with its source, or marked as an assumption.

| Input | Default | Source | Source year | Status |
|---|---|---|---|---|
| Electricity price | £168/MWh (16.8p/kWh) | DESNZ Energy Trends, manufacturing, excl. CCL | Q4 2025 | Sourced |
| Pipeline CAPEX | £3.98m/km at DN800 | Cadent/HyNet report: £178m for 109 km, i.e. £1.63m/km for 18–24 inch (2021 money). Restated ×1.243 to 2026 using ONS CPI 2021→2026 (2026 partly forecast). Scaled to DN800 with exponent 1.6. | 2021 base, 2026 restated | Sourced, with an assumed diameter exponent |
| Discount rate | 7% | Investor-rate assumption. Ofgem final RIIO-3 gas WACC is 5.18% (semi-nominal, regulated) and is shown as the low benchmark. No published UK hydrogen-pipeline investor hurdle rate was found. | 2025 benchmark | Assumption |
| LHV, density, viscosity, cp, k | 119.96 MJ/kg; 5.35 kg/m³; 8.76 µPa·s; 14.45 kJ/kg·K; 1.417 | NIST (via CoolProp) | Current | Sourced |
| Compressor CAPEX | £1,030/kW | Placeholder; DESNZ gives £80k per unit at an unstated size | — | Unsourced |
| Station spacing | 200 km | Assumption | — | Unsourced |
| Leakage | 0.2% per 1,000 km | Not yet traced to a published source | — | Unsourced |
| Velocity bands | 20 m/s amber, 30 m/s red | Screening choice, not a standard | — | Assumption |
| Fixed OPEX | 4% of CAPEX/yr | DESNZ uses 5% for compressor O&M; 4% kept pending review | 2023 | Assumption |
| Utilisation | 90% | LH₂ carrier study uses 8,000 h/yr (≈91%) | 2022 | Assumption |
| Asset life | 30 years | Assumption | — | Assumption |
| Hub coordinates | Approximate | Public locations, not survey data | — | Approximate |

**Yearly review.** Each year, in the first week of November, the repository owner re-checks every row marked Sourced or Assumption against new publications and updates this table:

1. Check DESNZ Energy Trends (electricity), ONS CPI (CAPEX restatement), Ofgem RIIO final determinations (WACC), and any new UK hydrogen pipeline cost reports (CAPEX).
2. Update the value, the source year and the date checked, and change the default in `index.html` if it moves.
3. Re-run the checks above, and record the new headline numbers.
4. Commit with a message that lists the inputs changed and their new sources.

Last reviewed: 30 October 2026.

## Dependencies (loaded from CDN)

- Leaflet 1.9.4 (map)
- Chart.js 4.4.1 (charts)
- OpenStreetMap tiles (map background)
- Inter (Google Fonts)

## Author

Shreyas Kadu
