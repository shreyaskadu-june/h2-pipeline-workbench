/*
 * Hydrogen pipeline screening model (pure functions, no DOM).
 *
 * Assumptions, stated so they can be checked:
 *  - Dedicated hydrogen pipeline, steady state, isothermal, Z held constant.
 *  - Flow in kg/s from LHV (120 MJ/kg). Routine leakage is a fraction of the
 *    source energy per 1000 km; it reduces delivered energy only.
 *  - Compressor stations every `spacing` km; each raises pressure from the
 *    outlet pressure back to the inlet pressure (ratio = Pin / Pout).
 *  - Friction: Darcy-Weisbach with Colebrook (iterative) at mean pressure.
 *  - Hydraulic capacity: flow at which the Darcy pressure drop over one section
 *    equals (Pin - Pout) x pipeline efficiency.
 *  - Cost: annualised (pipeline + compressor) CAPEX + fixed OPEX + compressor
 *    electricity, divided by net annual delivered kg.
 */
(function (root) {
  'use strict';

  var LHV_MJ_PER_KG = 120;     // hydrogen lower heating value
  var R = 8.314462618;         // J/(mol K)
  var M_H2 = 2.016e-3;         // kg/mol
  var MU_H2 = 8.9e-6;          // Pa s, hydrogen at ~15 C
  var CP_H2 = 14300;           // J/(kg K)
  var K_H2 = 1.41;             // heat capacity ratio

  function crf(i, n) {
    if (i === 0) return 1 / n;
    var g = Math.pow(1 + i, n);
    return i * g / (g - 1);
  }

  // Colebrook-White, solved by fixed-point iteration on 1/sqrt(f)
  function frictionFactor(Re, relRough) {
    if (Re < 2300) return 64 / Math.max(Re, 1);
    var f = 0.02;
    for (var k = 0; k < 60; k++) {
      var inv = -2 * Math.log10(relRough / 3.7 + 2.51 / (Re * Math.sqrt(f)));
      f = 1 / (inv * inv);
    }
    return f;
  }

  // Pressure drop (bar) over a section of length lengthKm for mass flow mKgS (kg/s)
  function sectionState(p, mKgS, lengthKm) {
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

  // Maximum source MW the section can carry with the allowable pressure drop
  function hydraulicCapacityMW(p, lengthKm) {
    var allowable = (p.pin - p.pout) * p.eff;   // bar
    var lo = 1e-3, hi = 1e4;                    // kg/s
    for (var k = 0; k < 80; k++) {
      var mid = 0.5 * (lo + hi);
      if (sectionState(p, mid, lengthKm).dPbar > allowable) hi = mid; else lo = mid;
    }
    return lo * LHV_MJ_PER_KG;                  // kg/s x MJ/kg = MW
  }

  // Isentropic compressor power for one station (MW)
  function stationPowerMW(p, mKgS) {
    var T = p.tC + 273.15;
    var ratio = p.pin / p.pout;
    var exp = (K_H2 - 1) / K_H2;
    var wIdeal = CP_H2 * T * (Math.pow(ratio, exp) - 1);   // J/kg
    return mKgS * wIdeal / p.ceff / 1e6;
  }

  function stationsFor(p, lengthKm) {
    return Math.max(1, Math.ceil(lengthKm / p.spacing));
  }

  function evaluate(p) {
    var L = p.routeKm;
    var leakFrac = p.leak / 100 * L / 1000;                 // routine loss over route
    var deliveredMW = p.srcMW * (1 - leakFrac);
    var leakMW = p.srcMW * leakFrac;
    var mGross = p.srcMW / LHV_MJ_PER_KG;                   // kg/s through pipe
    var mDel = deliveredMW / LHV_MJ_PER_KG;                 // kg/s delivered
    var n = stationsFor(p, L);
    var stationMW = stationPowerMW(p, mGross);
    var compMW = n * stationMW;
    var sectionKm = L / n;
    var hyd = sectionState(p, mGross, sectionKm);
    var capMW = hydraulicCapacityMW(p, sectionKm);

    var pipeCapex = p.capKm * L * Math.pow(p.dnMm / p.refDn, p.dexp);     // EUR
    var compCapex = compMW * 1000 * p.compKw;                             // EUR
    var capex = pipeCapex + compCapex;
    var i = p.wacc / 100;
    var annualCapex = capex * crf(i, p.life);
    var fixedOpex = capex * p.opex / 100;
    var elecCost = compMW * 8760 * (p.util / 100) * p.elec;               // EUR/yr
    var totalAnnual = annualCapex + fixedOpex + elecCost;
    var annualKg = mDel * 3600 * 8760 * (p.util / 100);
    var lco = totalAnnual / annualKg;                                     // EUR/kg

    var deliveredTpd = mDel * 86400 / 1000;
    var coverage = deliveredTpd / p.demand;
    var unmet = Math.max(0, p.demand - deliveredTpd);
    var penaltyPct = (compMW + leakMW) / p.srcMW * 100;

    return {
      routeKm: L, leakMW: leakMW, deliveredMW: deliveredMW,
      deliveredKgH: mDel * 3600, deliveredTpd: deliveredTpd,
      coverage: coverage, unmetTpd: unmet,
      stations: n, sectionKm: sectionKm, stationMW: stationMW, compMW: compMW,
      pipeCapex: pipeCapex, compCapex: compCapex, capex: capex,
      annualCapex: annualCapex, fixedOpex: fixedOpex, elecCost: elecCost,
      totalAnnual: totalAnnual, annualKt: annualKg / 1e6, lco: lco,
      penaltyPct: penaltyPct, capacityMW: capMW,
      vIn: hyd.vIn, vAvg: hyd.vAvg, Re: hyd.Re, f: hyd.f, dPbar: hyd.dPbar,
      inletDensity: hyd.rhoIn, inletVolFlowNm3H: mGross * 3600 / 0.08988,
      ratio: p.pin / p.pout
    };
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
    crf: crf,
    frictionFactor: frictionFactor,
    sectionState: sectionState,
    hydraulicCapacityMW: hydraulicCapacityMW,
    evaluate: evaluate,
    breakEvenKm: breakEvenKm,
    gridCell: gridCell,
    stationPowerMW: stationPowerMW,
    LHV_MJ_PER_KG: LHV_MJ_PER_KG
  };
})(typeof window !== 'undefined' ? window : globalThis);
