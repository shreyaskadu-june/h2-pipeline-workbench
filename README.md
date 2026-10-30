# UK Hydrogen Pipeline Techno-Economic Workbench

A static, browser-only screening calculator for hydrogen pipeline route feasibility, levelised transport cost (GBP/kg), compression duty, energy penalty and line inventory for UK corridors (Teesside, HyNet, Humber, Milford Haven, Grangemouth, London).

Currency is GBP. Compressor and threshold inputs are still placeholders; see the sources table before use.

Open `index.html` in a browser, or see the GitHub Pages site for this repository.

## Files

- `index.html`: layout and styles.
- `model.js`: calculation (no DOM), so it can be tested separately.
- `h2props.js`: hydrogen real-gas property table (NIST via CoolProp), loaded before `model.js`.
- `app.js`: wiring, charts, map and checks.

## What it models

- Dedicated hydrogen pipeline, steady state.
- Balance method (default): the line is marched in 10 km steps from the source pressure, with Darcy-Weisbach friction (Colebrook), fitting losses, real-gas density and viscosity from the NIST table, the Joule-Thomson temperature change and heat exchange with the ground. A compressor is added only where the pressure would fall below the minimum line pressure; it restores the source pressure and aftercools to the inlet temperature.
- Legacy ratio method (kept for comparison): one station per spacing interval, each imposing the pressure ratio Pin/Pout regardless of friction.
- Maximum allowable operating pressure from grade and wall thickness (IGEM/TD/1 Supplement 2 design factor for hydrogen, API 5L SMYS).
- CAPEX scaled with diameter; annualised with CRF; fixed OPEX and compressor electricity.
- Routine leakage per 1000 km (reduces delivered energy only).

## What it does not model

Transient flow and line-pack, elevation, impurities, fatigue life, repurposed-pipeline derating, accidental buried-pipeline release, and let-down energy recovery at the delivery end (on hold; not costed). Results are screening estimates, not a design basis.

## Checks

- The balance calculation was re-derived independently in Python with CoolProp properties evaluated directly (no lookup table). Delivered pressure and compression agree with the JavaScript for the cases tested (UK default, 1000 km, 45 bar source at 354 km and 3000 km).
- The legacy ratio method reproduces the earlier results: UK default compression 24.28 MW, LCO £0.71/kg at 354 km with no route factor on the current CAPEX basis (£0.87/kg on the previous basis).
- Hand check: for the UK default flow (8.33 kg/s, DN800, 177 km section), the Darcy gradient gives about 0.0038 bar/km, or about 0.7 bar per 177 km, which matches the marched result.
- UK default (Teesside to London: 354 km straight line × route factor 1.30 = 460 km; DN800; 1,000 MW; source 66.2 bar; delivery 39 bar abs; 7%; £168/MWh; CAPEX £3.11m/km at DN800 in 2026 money): no compressor is needed. Gas arrives at 64.4 bar and 10.6 °C. Energy penalty 0.09%, CAPEX £1,433m, levelised cost £0.73/kg, net 236 kt/yr, break-even about 1,250 km of pipeline (route length) at a £2.00/kg threshold.
- Without the route factor (354 km), the same case gives £0.56/kg.
- Legacy ratio method for the same 354 km case: compression 24.3 MW, penalty 2.5%, CAPEX £1,127m, levelised cost £0.71/kg. On the previous CAPEX basis (exponent 1.6, £3.98m/km) the same case gave £1,435m and £0.87/kg. The legacy method imposes a 2.2× ratio at each station, which friction does not require at this flow.
- Reference case (Rotterdam–Geleen, DN800, 1,000 MW, 167 km, legacy ratio method, EUR): compression 12.14 MW and penalty 1.25% reproduce. With the current defaults and the €2.15m/km pipeline cost, CAPEX is €372m and LCO €0.22/kg at 7%. The earlier figures of €432m and €0.24/kg cannot be reproduced because the exact inputs were not recorded; treat them as superseded. The hydraulic capacity is about 6,300 MW, not the 6,032 MW shown in the earlier reference.
- Route factor: the literature range is 1.20–1.40 (arXiv 2505.01124). It covers bends, deviations and detours. It does not cover vertical rise, river or road crossings, or special works.
- Delivery pressure: 39 bar abs (38 barg) follows the Gas Governance OAD Section I offtake limit. National Gas states the NTS typically operates above 40 barg. The lower-pressure network tiers could not be verified from the sources checked.
- Property table: covers 5–140 bar and −10 to 50 °C. The app rejects inputs outside this range.

## Uncertainties and sensitivities

Each section of the app lists its own uncertainties and shows a live one-at-a-time sensitivity table. Section 08 holds the full table with a source and status for each input. Headline swings for the UK default (levelised cost, £/kg):

- Route factor 1.10–1.40: £0.62 to £0.79 (swing £0.17).
- Pipeline CAPEX ±30%: £0.51 to £0.95 (swing £0.44).
- Discount rate 5.18–9%: £0.65 to £0.83 (swing £0.19).
- Diameter exponent 0.9–1.3: zero swing at DN800, because DN800 is the CAPEX anchor. Outside DN800 it matters: DN700 gives £0.64/kg and DN900 gives £0.82/kg at the default exponent.
- Electricity, source pressure, delivery pressure: zero swing for the UK default, because no compressor is needed in the tested ranges.
- Diameter DN 700–900 mm, diameter exponent, and the other inputs: see the table in section 08.

Known gaps: the route-factor range is not UK-specific; the CAPEX ±30% range is an assumption; the leakage, heat-transfer, wall and bend inputs are unsourced or assumed.

## Sources and yearly review

Every input that drives the answer is listed here with its source, or marked as an assumption.

| Input | Default | Source | Source year | Status |
|---|---|---|---|---|
| Electricity price | £168/MWh (16.8p/kWh) | DESNZ Energy Trends, manufacturing, excl. CCL | Q4 2025 | Sourced |
| Pipeline CAPEX | £3.11m/km at DN800 | Cadent/HyNet report: £178m for 109 km, i.e. £1.63m/km for 18–24 inch (2021 money). Restated ×1.243 to 2026 using ONS CPI 2021→2026 (2026 partly forecast). Scaled from DN525 to DN800 with exponent 1.02 (Brown et al. 2022 US slope, NETL H2_P_COM workbook VBA). | 2021 base, 2026 restated | Sourced level; exponent sourced from US equations (level and shape are not the same basis) |
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
| Route factor | 1.30 (range 1.20–1.40) | arXiv 2505.01124: literature detour factors 1.20–1.40; 1.30 is the paper's standard approach. Not UK-specific. | 2025 paper | Sourced range, not UK-specific |
| Delivery pressure | 39 bar abs (38 barg) | Gas Governance OAD Section I: offtake pressure limit 38 barg. National Gas: NTS typically above 40 barg. DNV 2025 tiers: LTS above 7 barg; IP 2–7 barg; MP 75 mbar–2 barg; LP below 75 mbar. | 2025 | Sourced |
| Design factor for hydrogen | 0.40 for X65 (0.50 X52, 0.43 X60, 0.37 X70) | IGEM/TD/1 Ed.6 Supplement 2, Table S1, as reproduced in the Cosham ICHEME paper. Check against the standard itself (it is paywalled). | Edition 6, Supplement 2 (edition date not verified) | Sourced |
| SMYS by grade | X65 448 MPa (X52 359, X60 414, X70 483) | API 5L specified minimum yield strength | Standard | Sourced |
| Ground temperature | 10.6 °C mean soil; 5.2–16 °C range at 1 m | British Geological Survey, GR_999999/1 (Ground Source Heat Pump, Basic) | 2018 | Sourced |
| Overall heat transfer to ground | 2 W/m²K | Assumption; a sourced buried-pipeline value is still to be found | — | Assumption (small effect: about 4 K cooling over the route) |
| Wall thickness | 16 mm | Input. Required wall at 66.2 bar for X65 DN800 is 15.3 mm (check shown in the app); MAOP 68.9 bar. | — | Assumption, checked against design factor |
| Fitting losses | 0.1 bends per km, K = 0.45 each | Crane TP-410 long-radius 90° elbow K = 0.45 (as reproduced in a Neutrium table; check the Crane original). Bend count is an assumption. | — | Partly sourced |
| Real-gas properties | Density, Z, viscosity, cp, k, Joule-Thomson coefficient | NIST via CoolProp 8.0.0 (`h2props.js`) | Current | Sourced |

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
