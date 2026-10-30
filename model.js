/*
 * Hydrogen pipeline screening model (pure functions, no DOM).
 *
 * Two pressure modes:
 *  - 'balance' (default): the line is marched in sub-steps along each section.
 *    Friction (Darcy-Weisbach, Colebrook), fitting losses, real-gas density and
 *    viscosity (NIST table), the Joule-Thomson temperature change and heat exchange
 *    with the ground are all evaluated at local pressure and temperature.
 *    Compressors restore the section inlet pressure at each station boundary and
 *    the gas is aftercooled to the inlet temperature. Delivery pressure is what
 *    remains at the outlet of the last section.
 *  - 'ratio' (legacy): the station pressure ratio Pin/Pout is imposed. Kept so the
 *    earlier screening results can be reproduced and compared.
 *
 * Other assumptions, stated so they can be checked:
 *  - Steady state. Routine leakage reduces delivered energy only.
 *  - Flow in kg/s from LHV (119.96 MJ/kg).
 *  - Compressor power: isentropic, ideal-gas form with real-gas cp and k at the
 *    station outlet state, divided by compressor efficiency.
 *  - Hydraulic capacity: flow at which the drop over one section equals
 *    (Pin - Pdelivery_min) x pipeline efficiency (balance) or (Pin - Pout) x
 *    efficiency (ratio).
 *  - Cost: annualised CAPEX + fixed OPEX + compressor electricity, divided by
 *    net annual delivered kg.
 */
(function (root) {
  'use strict';

  // Compressor cost basis: NETL H2_P_COM (2024) Eq. 3-22 to 3-24 (ANL HDSAM "H2 Compressor").
  // Uninstalled cost per compressor (2007$) = a * W^b, W = compressor motor power (kW).
  // Installed = 2 x uninstalled. Converted to GBP with US CPI-U 2007->2025 (officialdata.org, x1.5539)
  // and the 2025 average GBP/USD (1.3193, poundsterlinglive.com).
  var NETL_COMP_A = 1962.2, NETL_COMP_B = 0.8335, NETL_COMP_INSTALL = 2;
  var CPI_2007_TO_2025 = 1.5539, CPI_2023_TO_2025 = 1.06, USD_PER_GBP_2025 = 1.3193;
  function compCostGBP(wKw) {
    if (!(wKw > 0)) return 0;
    return NETL_COMP_INSTALL * NETL_COMP_A * Math.pow(wKw, NETL_COMP_B) * CPI_2007_TO_2025 / USD_PER_GBP_2025;
  }
  var LHV_MJ_PER_KG = 119.96;     // hydrogen lower heating value (NIST: 119.96 MJ/kg)
  var R = 8.314462618;            // J/(mol K)
  var M_H2 = 2.016e-3;            // kg/mol
  var MU_H2 = 8.76e-6;            // Pa s, hydrogen at ~15 C (legacy ratio mode)
  var CP_H2 = 14450;              // J/(kg K) (legacy ratio mode)
  var K_H2 = 1.417;               // heat capacity ratio (legacy ratio mode)
  var STEP_KM = 10;               // integration step along the line (balance mode)

  // Line-pipe design factor for hydrogen service and specified minimum yield strength.
  // Design factor: IGEM/TD/1 Ed.6 Supplement 2, Table S1 (as reproduced in the Cosham
  // ICHEME paper). SMYS: API 5L specified minimum yield strength (MPa).
  var GRADES = {
    X52: { F: 0.50, smys: 359 },
    X60: { F: 0.43, smys: 414 },
    X65: { F: 0.40, smys: 448 },
    X70: { F: 0.37, smys: 483 }
  };

  function crf(i, n) {
    if (i === 0) return 1 / n;
    var g = Math.pow(1 + i, n);
    return i * g / (g - 1);
  }

  // Colebrook-White, solved by fixed-point iteration on 1/sqrt(f); stops on convergence
  function frictionFactor(Re, relRough) {
    if (Re < 2300) return 64 / Math.max(Re, 1);
    var f = 0.02;
    for (var k = 0; k < 100; k++) {
      var inv = -2 * Math.log10(relRough / 3.7 + 2.51 / (Re * Math.sqrt(f)));
      var fNew = 1 / (inv * inv);
      if (Math.abs(fNew - f) < 1e-10 * f) { f = fNew; break; }
      f = fNew;
    }
    return f;
  }

  // Maximum allowable operating pressure (bar) from wall thickness and grade.
  // Hoop stress limit = design factor x SMYS; pressure = 2 t sigma / OD.
  // Required wall thickness (mm) for source pressure p.pin at the grade's design factor:
  // t = P ID / (2 (sigma - P)), with P and sigma in MPa.
  function requiredWallMm(p) {
    var g = GRADES[p.grade] || GRADES.X65;
    var sigma = g.F * g.smys;
    var P = p.pin / 10;
    return sigma > P ? P * p.dnMm / (2 * (sigma - P)) : Infinity;
  }

  function maopBar(p) {
    var g = GRADES[p.grade] || GRADES.X65;
    var od = p.dnMm + 2 * p.wallMm;
    return 2 * p.wallMm * g.F * g.smys / od * 10;   // MPa -> bar
  }

  // ---------- Real-gas properties (NIST table, bilinear interpolation) ----------
  function props(P, Tc) {
    var T = root.H2_PROPS;
    var pBar = T.P_bar, tC = T.T_C;
    var p = Math.min(Math.max(P, pBar[0]), pBar[pBar.length - 1]);
    var t = Math.min(Math.max(Tc, tC[0]), tC[tC.length - 1]);
    var i = 0; while (i < pBar.length - 2 && pBar[i + 1] < p) i++;
    var j = 0; while (j < tC.length - 2 && tC[j + 1] < t) j++;
    var fp = (p - pBar[i]) / (pBar[i + 1] - pBar[i]);
    var ft = (t - tC[j]) / (tC[j + 1] - tC[j]);
    function bil(arr) {
      var a = arr[i][j] * (1 - ft) + arr[i][j + 1] * ft;
      var b = arr[i + 1][j] * (1 - ft) + arr[i + 1][j + 1] * ft;
      return a * (1 - fp) + b * fp;
    }
    return { rho: bil(T.rho), Z: bil(T.Z), mu: bil(T.mu), cp: bil(T.cp), k: bil(T.k), jt: bil(T.jt) };
  }

  // ---------- Balance mode: march along the line ----------
  // Marches from pIn (bar) and tIn (C) over lengthKm in steps of about stepKm.
  // With allowInsert, a compressor restores the pressure to pIn (aftercooled to tC)
  // each time the pressure would fall below p.pdel. Returns outlet state and totals.
  function march(p, mKgS, lengthKm, allowInsert) {
    var D = p.dnMm / 1000;
    var A = Math.PI * D * D / 4;
    var perim = Math.PI * D;
    var N = Math.max(1, Math.ceil(lengthKm / STEP_KM));
    var dx = lengthKm * 1000 / N;
    var kFitPerM = p.bendsPerKm * p.kBend / 1000;     // K-factor units per metre
    var roughRel = (p.roughMm / 1000) / D;
    var P = p.pin, T = p.tC, dPtot = 0, vSum = 0, vIn = 0, rhoIn = 0, reSum = 0, fSum = 0;
    var stations = 0, compMW = 0, minP = p.pin, maxStationRatio = 1;
    for (var s = 0; s < N; s++) {
      var pr = props(P, T);
      var v = mKgS / (pr.rho * A);
      if (s === 0) { vIn = v; rhoIn = pr.rho; }
      var Re = pr.rho * v * D / pr.mu;
      var f = frictionFactor(Re, roughRel);
      var dPPa = (f * dx / D + kFitPerM * dx) * pr.rho * v * v / 2;
      // Ground heat exchange: dT = -U pi D dx (T - Tg) / (m cp)
      var dTheat = -(p.uW * perim * dx) * (T - p.groundC) / (mKgS * pr.cp);
      // Joule-Thomson: dT = mu_JT dP (dP negative for a pressure drop)
      var dTjt = pr.jt * (-dPPa);
      P -= dPPa / 1e5;
      T += dTjt + dTheat;
      dPtot += dPPa; vSum += v; reSum += Re; fSum += f;
      if (P < minP) minP = P;
      if (allowInsert && P < p.pdel) {
        var w = balanceStationMW(p, mKgS, P, T, p.pin);
        compMW += w; stations++;
        maxStationRatio = Math.max(maxStationRatio, p.pin / P);
        P = p.pin; T = p.tC;                     // restored and aftercooled
      }
    }
    return {
      pOut: P, tOut: T, dPbar: dPtot / 1e5, minPbar: minP,
      vIn: vIn, vAvg: vSum / N, rhoIn: rhoIn, Re: reSum / N, f: fSum / N,
      stations: stations, compMW: compMW, maxStationRatio: maxStationRatio
    };
  }

  // Compressor power (MW) raising gas from pSuc (bar) to pDis (bar), inlet at tSuc (C).
  // Isentropic ideal-gas form with real-gas cp and k at the suction state.
  function balanceStationMW(p, mKgS, pSuc, tSuc, pDis) {
    var pr = props(pSuc, tSuc);
    var Tk = tSuc + 273.15;
    var ratio = pDis / pSuc;
    var exp = (pr.k - 1) / pr.k;
    var wIdeal = pr.cp * Tk * (Math.pow(ratio, exp) - 1);   // J/kg
    return mKgS * wIdeal / p.ceff / 1e6;
  }

  // Maximum source MW for which the drop over one spacing interval stays within
  // the allowable drop (Pin - Pdel) x efficiency (screening definition)
  function balanceCapacityMW(p, lengthKm) {
    var allowable = (p.pin - p.pdel) * p.eff;   // bar
    var lo = 1e-3, hi = 1e4;                     // kg/s
    for (var k = 0; k < 60; k++) {
      var mid = 0.5 * (lo + hi);
      if (march(p, mid, lengthKm, false).dPbar > allowable) hi = mid; else lo = mid;
    }
    return lo * LHV_MJ_PER_KG;
  }

  // ---------- Legacy ratio mode ----------
  function sectionStateRatio(p, mKgS, lengthKm) {
    var D = p.dnMm / 1000;
    var A = Math.PI * D * D / 4;
    var T = p.tC + 273.15;
    var rhoIn = p.pin * 1e5 * M_H2 / (p.z * R * T);
    var vIn = mKgS / (rhoIn * A);
    var pAvg = (p.pin + p.pout) / 2;
    var rhoAvg = rhoIn * pAvg / p.pin;
    var vAvg = mKgS / (rhoAvg * A);
    var Re = rhoAvg * vAvg * D / MU_H2;
    var f = frictionFactor(Re, (p.roughMm / 1000) / D);
    var dPPa = f * (lengthKm * 1000 / D) * rhoAvg * vAvg * vAvg / 2;
    return { rhoIn: rhoIn, vIn: vIn, vAvg: vAvg, Re: Re, f: f, dPbar: dPPa / 1e5 };
  }

  function capacityRatioMW(p, lengthKm) {
    var allowable = (p.pin - p.pout) * p.eff;
    var lo = 1e-3, hi = 1e4;
    for (var k = 0; k < 80; k++) {
      var mid = 0.5 * (lo + hi);
      if (sectionStateRatio(p, mid, lengthKm).dPbar > allowable) hi = mid; else lo = mid;
    }
    return lo * LHV_MJ_PER_KG;
  }

  function stationPowerRatioMW(p, mKgS) {
    var T = p.tC + 273.15;
    var ratio = p.pin / p.pout;
    var exp = (K_H2 - 1) / K_H2;
    var wIdeal = CP_H2 * T * (Math.pow(ratio, exp) - 1);
    return mKgS * wIdeal / p.ceff / 1e6;
  }

  function stationsFor(p, lengthKm) {
    return Math.max(1, Math.ceil(lengthKm / p.spacing));
  }

  // ---------- Evaluation ----------
  function evaluate(p) {
    return p.mode === 'ratio' ? evaluateRatio(p) : evaluateBalance(p);
  }

  function finish(p, L, leakMW, deliveredMW, mGross, mDel, compMW, stationMW, n, sectionKm, capMW, extra) {
    var pipeCapex = p.capKm * L * Math.pow(p.dnMm / p.refDn, p.dexp) * (1 + (p.specPct || 0) / 100);     // GBP, incl. special works allowance
    var compCapex = n > 0 ? n * compCostGBP(stationMW * 1000) * (p.compMult == null ? 1 : p.compMult) : 0;  // GBP, NETL power law per station
    var capex = pipeCapex + compCapex;
    var i = p.wacc / 100;
    var annualCapex = capex * crf(i, p.life);
    var fixedOpex = capex * p.opex / 100;
    var elecCost = compMW * 8760 * (p.util / 100) * p.elec;               // GBP/yr
    var totalAnnual = annualCapex + fixedOpex + elecCost;
    var annualKg = mDel * 3600 * 8760 * (p.util / 100);
    var lco = totalAnnual / annualKg;                                     // GBP/kg
    var deliveredTpd = mDel * 86400 / 1000;
    var coverage = deliveredTpd / p.demand;
    var unmet = Math.max(0, p.demand - deliveredTpd);
    var penaltyPct = (compMW + leakMW) / p.srcMW * 100;
    var out = {
      routeKm: L, leakMW: leakMW, deliveredMW: deliveredMW,
      deliveredKgH: mDel * 3600, deliveredTpd: deliveredTpd,
      coverage: coverage, unmetTpd: unmet,
      stations: n, sectionKm: sectionKm, stationMW: stationMW, compMW: compMW,
      pipeCapex: pipeCapex, compCapex: compCapex, capex: capex,
      annualCapex: annualCapex, fixedOpex: fixedOpex, elecCost: elecCost,
      totalAnnual: totalAnnual, annualKt: annualKg / 1e6, lco: lco,
      penaltyPct: penaltyPct, capacityMW: capMW,
      inletVolFlowNm3H: mGross * 3600 / 0.08988
    };
    for (var key in extra) out[key] = extra[key];
    return out;
  }

  function evaluateBalance(p) {
    var L = p.routeKm;
    var leakFrac = p.leak / 100 * L / 1000;
    var deliveredMW = p.srcMW * (1 - leakFrac);
    var leakMW = p.srcMW * leakFrac;
    var mGross = p.srcMW / LHV_MJ_PER_KG;
    var mDel = deliveredMW / LHV_MJ_PER_KG;
    var route = march(p, mGross, L, true);
    var n = route.stations;
    var stationMW = n > 0 ? route.compMW / n : 0;
    var compMW = route.compMW;
    var spacingKm = Math.min(p.spacing, L);
    var capMW = balanceCapacityMW(p, spacingKm);
    var maop = maopBar(p);
    var sectionKm = L / (n + 1);

    return finish(p, L, leakMW, deliveredMW, mGross, mDel, compMW, stationMW, n, sectionKm, capMW, {
      mode: 'balance',
      vIn: route.vIn, vAvg: route.vAvg, Re: route.Re, f: route.f, dPbar: route.dPbar,
      inletDensity: route.rhoIn, ratio: route.maxStationRatio,
      pDelivered: route.pOut, tDelivered: route.tOut, 
      minPressureBar: route.minPbar, deliveryOk: route.pOut >= p.pdel,
      pInlet: p.pin, pdel: p.pdel, maopBar: maop, maopOk: p.pin <= maop,
      stationsCount: n, requiredWallMm: requiredWallMm(p)
    });
  }

  function evaluateRatio(p) {
    var L = p.routeKm;
    var leakFrac = p.leak / 100 * L / 1000;
    var deliveredMW = p.srcMW * (1 - leakFrac);
    var leakMW = p.srcMW * leakFrac;
    var mGross = p.srcMW / LHV_MJ_PER_KG;
    var mDel = deliveredMW / LHV_MJ_PER_KG;
    var n = stationsFor(p, L);
    var stationMW = stationPowerRatioMW(p, mGross);
    var compMW = n * stationMW;
    var sectionKm = L / n;
    var hyd = sectionStateRatio(p, mGross, sectionKm);
    var capMW = capacityRatioMW(p, sectionKm);
    return finish(p, L, leakMW, deliveredMW, mGross, mDel, compMW, stationMW, n, sectionKm, capMW, {
      mode: 'ratio',
      vIn: hyd.vIn, vAvg: hyd.vAvg, Re: hyd.Re, f: hyd.f, dPbar: hyd.dPbar,
      inletDensity: hyd.rhoIn, ratio: p.pin / p.pout,
      pDelivered: p.pout, tDelivered: p.tC, deliveryOk: true,
      pInlet: p.pin, pdel: p.pout, maopBar: maopBar(p), maopOk: p.pin <= maopBar(p),
      sectionDropBar: hyd.dPbar, stationsCount: n, requiredWallMm: requiredWallMm(p)
    });
  }

  // Largest distance (km) in [50, 5000] that stays at or below the threshold
  function breakEvenKm(p) {
    var best = null;
    for (var L = 50; L <= 5000; L += 10) {
      var q = Object.assign({}, p, { routeKm: L });
      if (evaluate(q).lco <= p.thr) best = L; else break;
    }
    return best;
  }

  // Grid cell: fixed DN, annual net throughput (kt/yr) and distance (km)
  function gridCell(p, ktYr, distKm) {
    var kgPerS = ktYr * 1e6 / (8760 * 3600 * (p.util / 100));   // delivered kg/s
    var srcMW = kgPerS * LHV_MJ_PER_KG / (1 - p.leak / 100 * distKm / 1000);
    var q = Object.assign({}, p, { srcMW: srcMW, routeKm: distKm });
    var r = evaluate(q);
    var cls;
    if (r.capacityMW < srcMW || r.vAvg > p.vmax) cls = 'limit';
    else if (r.lco <= p.thr) cls = r.vAvg <= 20 ? 'pass' : 'cond';
    else cls = 'fail';
    return { lco: r.lco, vAvg: r.vAvg, cls: cls };
  }

  root.H2Model = {
    compCostGBP: compCostGBP,
    crf: crf,
    frictionFactor: frictionFactor,
    props: props,
    maopBar: maopBar,
    requiredWallMm: requiredWallMm,
    march: march,
    balanceStationMW: balanceStationMW,
    sectionStateRatio: sectionStateRatio,
    hydraulicCapacityMW: capacityRatioMW,
    balanceCapacityMW: balanceCapacityMW,
    evaluate: evaluate,
    breakEvenKm: breakEvenKm,
    gridCell: gridCell,
    stationPowerMW: stationPowerRatioMW,
    GRADES: GRADES,
    LHV_MJ_PER_KG: LHV_MJ_PER_KG
  };
})(typeof window !== 'undefined' ? window : globalThis);
