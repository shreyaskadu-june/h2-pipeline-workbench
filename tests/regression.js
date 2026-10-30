// Regression checks for the H2 pipeline model. Run: node tests/regression.js
// Each check compares a model output with a value that was reproduced from a published source
// or from the model's own recorded results. Exits non-zero on any failure.
const path = require('path');
const root = path.join(__dirname, '..');
require(path.join(root, 'h2props.js'));
require(path.join(root, 'model.js'));
const M = globalThis.H2Model;

let fails = 0;
function check(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ': got ' + (+got).toFixed(4) + ', want ' + want + ' ±' + tol);
}

// Base UK default (matches index.html defaults)
const base = {
  mode: 'balance', dnMm: 800, pin: 66.2, pdel: 39, pout: 39, tC: 15, roughMm: 0.045, eff: 0.90, vmax: 30,
  srcMW: 1000, demand: 300, util: 90, leak: 0.2, spacing: 200, ceff: 0.75, maxpen: 15,
  capKm: 3114245, dexp: 1.02, refDn: 800, compMult: 1, specPct: 0, opex: 4, elec: 168, life: 30, wacc: 7,
  thr: 2.0, grade: 'X65', wallMm: 16, groundC: 10.6, uW: 2, bendsPerKm: 0.1, kBend: 0.45, routeKm: 460
};

// 1. Capital recovery factor: 7% over 30 years
check('CRF(7%,30)', M.crf(0.07, 30), 0.08059, 0.0001);

// 2. NETL compressor power law (NETL H2_P_COM Eq. 3-22 to 3-24; ANL HDSAM), converted to GBP
//    Workbook check: W = 1,018.1 kW motor gives 2007$ uninstalled ≈ 630,579 (Eng Mod D204).
const uninst2007 = 1962.2 * Math.pow(1018.1, 0.8335);
check('NETL uninstalled 2007$ at 1,018.1 kW vs workbook D204 (630,579)', uninst2007, 630579, 2000);
check('compCostGBP at 1 MW (£)', M.compCostGBP(1000), 1463365, 2000);

// 3. Hydraulic sizing vs NETL: 1000 -> 705 psig at 12.68 t/h (NETL Eng Mod G37) over 80.47 km.
//    Solve the bore that gives NETL's 20.34 bar drop (uncompressed). NETL minimum ID 10.059 in = 255.5 mm.
const psi = function (p) { return p * 0.0689476 + 1.01325; };
const mdot = 12.684 / 3.6;  // kg/s
const sizeBase = { pin: psi(1000), pdel: psi(705), tC: 11.67, roughMm: 0.0457, eff: 0.9,
                   groundC: 11.67, uW: 0, bendsPerKm: 0, kBend: 0 };
const dropAt = function (D) { return M.march(Object.assign({}, sizeBase, { dnMm: D }), mdot, 80.4672, false).dPbar; };
let lo = 150, hi = 400;
for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (dropAt(m) > 20.34) lo = m; else hi = m; }
check('bore for NETL 20.34 bar drop (mm) vs NETL 255.5', (lo + hi) / 2, 255.5, 2.55);  // within 1%

// 4. UK default levelised cost (current inputs)
const uk = M.evaluate(Object.assign({}, base));
check('UK default LCO £/kg', uk.lco, 0.731, 0.002);
check('UK default CAPEX £m', uk.capex / 1e6, 1433, 2);
check('UK default compressor stations', uk.stations, 0, 0);
check('UK default delivered pressure bar', uk.pDelivered, 64.39, 0.05);

// 5. Legacy ratio reproduction (24.28 MW at 354 km, outlet 30 bar; independent of cost inputs)
const leg = M.evaluate(Object.assign({}, base, { mode: 'ratio', routeKm: 354, pout: 30 }));
check('legacy ratio compression MW (354 km, pout 30)', leg.compMW, 24.28, 0.05);

// 6. Compressor cost: with compression, compressor CAPEX = stations × compCostGBP(station kW)
const comp = M.evaluate(Object.assign({}, base, { mode: 'ratio', routeKm: 354, pout: 30 }));
const expected = comp.stations * M.compCostGBP(comp.stationMW * 1000);
check('compressor CAPEX equals stations × NETL basis', comp.compCapex, expected, 1);

// 7. Special works allowance scales pipeline CAPEX only
const sw = M.evaluate(Object.assign({}, base, { specPct: 10 }));
check('special works 10% raises pipeline CAPEX by 10%', sw.pipeCapex / uk.pipeCapex, 1.10, 1e-9);

console.log(fails === 0 ? '\nAll regression checks passed.' : '\n' + fails + ' check(s) FAILED.');
process.exit(fails === 0 ? 0 : 1);
