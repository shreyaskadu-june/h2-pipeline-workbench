/* UI wiring for the Hydrogen Pipeline Techno-Economic Workbench. Depends on model.js. */
(function () {
  'use strict';
  var H = window.H2Model;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (x, d) { return Number(x).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var eur = function (x, d) { return '£' + fmt(x, d === undefined ? 2 : d); };
  var css = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };

  // UK hydrogen corridor presets. Coordinates are approximate hub locations.
  // Pipeline length = straight-line distance x route factor (default 1.30), both editable in the form.
  var PRESETS = [
    { key: 'teesside-london', label: 'Teesside to London (demand)',
      srcName: 'Teesside hub', srcLat: 54.60, srcLon: -1.15,
      sinkName: 'London (demand)', sinkLat: 51.51, sinkLon: 0.10 },
    { key: 'hynet-humber', label: 'HyNet (Stanlow) to Humber',
      srcName: 'HyNet (Stanlow)', srcLat: 53.27, srcLon: -2.80,
      sinkName: 'Humber (Killingholme)', sinkLat: 53.62, sinkLon: -0.20 },
    { key: 'milford-london', label: 'Milford Haven to London',
      srcName: 'Milford Haven', srcLat: 51.71, srcLon: -5.03,
      sinkName: 'London (demand)', sinkLat: 51.51, sinkLon: 0.10 },
    { key: 'grangemouth-teesside', label: 'Grangemouth to Teesside',
      srcName: 'Grangemouth', srcLat: 56.01, srcLon: -3.72,
      sinkName: 'Teesside hub', sinkLat: 54.60, sinkLon: -1.15 }
  ];

  function presetRoute(pr) {
    var km = Math.round(haversineKm(pr.srcLat, pr.srcLon, pr.sinkLat, pr.sinkLon));
    return { srcName: pr.srcName, srcLat: pr.srcLat, srcLon: pr.srcLon,
             sinkName: pr.sinkName, sinkLat: pr.sinkLat, sinkLon: pr.sinkLon, routeKm: km };
  }

  var state = { map: null, srcMarker: null, sinkMarker: null, line: null, mode: null, charts: {} };

  function num(id) { return Number($(id).value); }

  function readParams() {
    var straightKm = num('routeKmIn'), factor = num('routeFactor');
    return {
      straightKm: straightKm, routeFactor: factor, routeKm: straightKm * factor,
      leak: num('leak'), srcMW: num('srcMW'), dnMm: num('dn'),
      mode: $('mode').value, grade: $('grade').value, wallMm: num('wallMm'),
      pin: num('pin'), pdel: num('pdel'), pout: num('pout'), tC: num('tC'), z: num('z'), roughMm: num('rough'),
      eff: num('eff'), vmax: num('vmax'), spacing: num('spacing'), ceff: num('ceff'),
      groundC: num('groundC'), uW: num('uW'), bendsPerKm: num('bendsPerKm'), kBend: num('kBend'),
      capKm: num('capKm'), dexp: num('dexp'), refDn: num('refDn'), compKw: num('compKw'),
      opex: num('opex'), elec: num('elec'), life: num('life'), wacc: num('wacc'),
      util: num('util'), demand: num('demand'), thr: num('thr'), maxpen: num('maxpen')
    };
  }

  function validate(p) {
    var keys = Object.keys(p);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === 'mode' || keys[i] === 'grade') continue;   // text choices
      if (!isFinite(p[keys[i]])) return 'Enter a number in every field.';
    }
    if (p.mode !== 'ratio' && p.mode !== 'balance') return 'Choose a pressure method.';
    if (!H.GRADES[p.grade]) return 'Choose a line-pipe grade.';
    if (p.straightKm <= 0) return 'Straight-line distance must be positive.';
    if (p.routeFactor < 1) return 'Route factor must be at least 1.';
    if (p.dnMm <= 0 || p.refDn <= 0) return 'Diameter must be positive.';
    if (p.pdel <= 0) return 'Minimum line pressure must be positive.';
    if (p.mode === 'ratio') {
      if (p.pin <= p.pout) return 'Inlet pressure must be above the legacy outlet pressure.';
      if (p.pout <= 0) return 'Outlet pressure must be positive.';
    } else if (p.pin <= p.pdel) {
      return 'Source pressure must be above the minimum line pressure.';
    }
    if (p.wallMm <= 0) return 'Wall thickness must be positive.';
    if (p.mode !== 'ratio' && (p.pin > 140 || p.pin < 5 || p.pdel < 5)) {
      return 'Balance method pressures must be between 5 and 140 bar (the property table range).';
    }
    if (p.mode !== 'ratio' && (p.tC < -10 || p.tC > 50)) {
      return 'Gas temperature must be between -10 and 50 °C (the property table range).';
    }
    if (p.uW < 0) return 'Heat transfer coefficient cannot be negative.';
    if (p.eff <= 0 || p.eff > 1) return 'Pipeline efficiency must be between 0 and 1.';
    if (p.ceff <= 0 || p.ceff > 1) return 'Compressor efficiency must be between 0 and 1.';
    if (p.util <= 0 || p.util > 100) return 'Utilisation must be between 0 and 100%.';
    if (p.life <= 0) return 'Lifetime must be positive.';
    if (p.spacing <= 0) return 'Station spacing must be positive.';
    if (p.srcMW <= 0 || p.demand <= 0) return 'Source capacity and demand must be positive.';
    if (p.wacc <= -100) return 'WACC is out of range.';
    return '';
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371, toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function setRouteFields(r) {
    $('srcName').value = r.srcName; $('srcLat').value = r.srcLat; $('srcLon').value = r.srcLon;
    $('sinkName').value = r.sinkName; $('sinkLat').value = r.sinkLat; $('sinkLon').value = r.sinkLon;
    $('routeKmIn').value = r.routeKm;
  }

  function routeFromFields() {
    return {
      srcName: $('srcName').value || 'Source', srcLat: num('srcLat'), srcLon: num('srcLon'),
      sinkName: $('sinkName').value || 'Sink', sinkLat: num('sinkLat'), sinkLon: num('sinkLon'),
      routeKm: num('routeKmIn')
    };
  }

  // ---------- Map ----------
  function initMap() {
    if (typeof L === 'undefined') {
      $('mapStatus').textContent = 'Map unavailable (Leaflet did not load). Calculations still run from the fields.';
      return;
    }
    var r = routeFromFields();
    state.map = L.map('map', { zoomControl: true, scrollWheelZoom: true })
      .setView([(r.srcLat + r.sinkLat) / 2, (r.srcLon + r.sinkLon) / 2], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(state.map);
    state.map.on('click', onMapClick);
    drawMap();
  }

  function drawMap() {
    if (!state.map) return;
    var r = routeFromFields();
    var s = [r.srcLat, r.srcLon], t = [r.sinkLat, r.sinkLon];
    if (!state.srcMarker) {
      state.srcMarker = L.marker(s, { title: 'Source' }).addTo(state.map);
      state.sinkMarker = L.marker(t, { title: 'Sink' }).addTo(state.map);
      state.line = L.polyline([s, t], { color: '#2d4a6b', weight: 4, opacity: 0.85 }).addTo(state.map);
    } else {
      state.srcMarker.setLatLng(s); state.sinkMarker.setLatLng(t); state.line.setLatLngs([s, t]);
    }
    state.srcMarker.bindTooltip(r.srcName);
    state.sinkMarker.bindTooltip(r.sinkName);
    if (!state.fitted) {
      state.map.fitBounds(L.latLngBounds([s, t]).pad(0.3));
      state.fitted = true;
    }
  }

  function setMode(mode) {
    state.mode = mode;
    $('setSrc').classList.toggle('active', mode === 'src');
    $('setSink').classList.toggle('active', mode === 'sink');
    $('mapStatus').textContent = mode
      ? 'Click the map to place the ' + (mode === 'src' ? 'source' : 'sink') + '. Click the button again to cancel.'
      : 'Select Source or Sink, then click the map to place it. Outside selection mode, drag to pan.';
    if (state.map) state.map.getContainer().style.cursor = mode ? 'crosshair' : '';
  }

  function onMapClick(e) {
    if (!state.mode) return;
    var lat = Math.round(e.latlng.lat * 1000) / 1000, lon = Math.round(e.latlng.lng * 1000) / 1000;
    if (state.mode === 'src') { $('srcLat').value = lat; $('srcLon').value = lon; $('srcName').value = 'Custom source'; }
    else { $('sinkLat').value = lat; $('sinkLon').value = lon; $('sinkName').value = 'Custom sink'; }
    var r = routeFromFields();
    $('routeKmIn').value = Math.round(haversineKm(r.srcLat, r.srcLon, r.sinkLat, r.sinkLon));
    setMode(null);
    render();
  }

  // ---------- Rendering ----------
  function cellHtml(c) {
    var label = { pass: 'passes', cond: 'conditional', limit: 'capacity-limited', fail: 'above cost' }[c.cls];
    return '<td class="cell ' + c.cls + '">' + (c.cls === 'limit' ? '' : eur(c.lco) + '/kg') +
      '<small>' + label + '</small></td>';
  }

  function renderGrid(p) {
    var dists = [250, 500, 1000, 2000, 3000, 5000];
    var kts = [25, 50, 100, 250, 500];
    var h = '<thead><tr><th>Annual H₂</th>';
    dists.forEach(function (d) { h += '<th>' + fmt(d, 0) + ' km</th>'; });
    h += '</tr></thead><tbody>';
    kts.forEach(function (kt) {
      h += '<tr><th>' + kt + ' kt/yr</th>';
      dists.forEach(function (d) { h += cellHtml(H.gridCell(p, kt, d)); });
      h += '</tr>';
    });
    $('gridTable').innerHTML = h + '</tbody>';
  }

  function scenarioRow(name, q) {
    var r = H.evaluate(q);
    return '<tr><td>' + name + '</td><td>' + fmt(r.deliveredMW, 0) + ' MW</td><td>' +
      fmt(r.coverage * 100, 0) + '%</td><td>' + eur(r.lco) + '/kg</td><td>£' + fmt(r.capex / 1e6, 1) + 'm</td></tr>';
  }

  function renderScenarios(p) {
    var h = '<thead><tr><th>Scenario</th><th>Delivered</th><th>Coverage</th><th>LCO</th><th>CAPEX</th></tr></thead><tbody>';
    h += scenarioRow('Base case', p);
    h += scenarioRow('DN +100 mm', Object.assign({}, p, { dnMm: p.dnMm + 100 }));
    h += scenarioRow('1,000 km corridor', Object.assign({}, p, { routeKm: 1000 }));
    h += scenarioRow('3,000 km corridor', Object.assign({}, p, { routeKm: 3000 }));
    $('snapTable').innerHTML = h + '</tbody>';
  }

  function row(label, value) { return '<tr><td style="color:var(--muted)">' + label + '</td><td style="text-align:right">' + value + '</td></tr>'; }

  function renderTables(p, r) {
    $('hydTable').innerHTML =
      row('Flow at inlet', fmt(r.inletVolFlowNm3H, 0) + ' Nm³/h') +
      row('Available source energy', fmt(p.srcMW, 0) + ' MW entering pipe') +
      row('Average gas velocity', fmt(r.vAvg, 1) + ' m/s') +
      row('Inlet velocity', fmt(r.vIn, 1) + ' m/s') +
      row('Pressure method', p.mode === 'ratio' ? 'Legacy imposed ratio' : 'Balance (compress when needed)') +
      row('Source pressure', fmt(p.pin, 1) + ' bar abs') +
      row('Delivered pressure', fmt(r.pDelivered, 1) + ' bar abs at ' + fmt(r.tDelivered, 1) + ' °C') +
      row('Lowest pressure on the line', fmt(r.minPressureBar !== undefined ? r.minPressureBar : r.pDelivered, 1) + ' bar abs') +
      row('Maximum station ratio', fmt(r.ratio, 2)) +
      row('Compressor stations', r.stations + (r.stations > 0 ? ' (average power ' + fmt(r.stationMW, 2) + ' MW)' : '')) +
      row('MAOP for grade and wall', fmt(r.maopBar, 1) + ' bar (required wall at source pressure ' + fmt(r.requiredWallMm, 1) + ' mm)') +
      row('Hydraulic capacity (per section)', fmt(r.capacityMW, 0) + ' MW') +
      row('Net annual delivery', fmt(r.annualKt, 1) + ' kt/yr') +
      row('Break-even distance (threshold)', (H.breakEvenKm(p) === null ? 'below 50 km' : fmt(H.breakEvenKm(p), 0) + ' km'));
    $('comTable').innerHTML =
      row('Compressor electricity cost', '£' + fmt(r.elecCost / 1e6, 1) + 'm/yr') +
      row('Fixed OPEX', '£' + fmt(r.fixedOpex / 1e6, 1) + 'm/yr') +
      row('Annualised CAPEX', '£' + fmt(r.annualCapex / 1e6, 1) + 'm/yr') +
      row('Total annual cost', '£' + fmt(r.totalAnnual / 1e6, 1) + 'm/yr') +
      row('Pipeline CAPEX', '£' + fmt(r.pipeCapex / 1e6, 1) + 'm') +
      row('Compressor CAPEX', '£' + fmt(r.compCapex / 1e6, 1) + 'm') +
      row('Levelised transport cost', eur(r.lco) + '/kg') +
      row('Energy penalty', fmt(r.penaltyPct, 2) + '%');
  }

  function check(kind, title, text) {
    var label = kind === 'ok' ? 'OK' : 'WARN';
    return '<div class="check"><span class="badge ' + kind + '">' + label + '</span><div><h4>' + title + '</h4><p>' + text + '</p></div></div>';
  }

  function renderChecks(p, r) {
    var be = H.breakEvenKm(p);
    var h = '';
    h += check('warn', 'Dedicated hydrogen design', 'Purpose-built H₂ service is assumed. The reference workbench cites examples near 65 bar(g); this is context, not a design limit, and has not been independently verified here.');
    h += p.srcMW <= r.capacityMW
      ? check('ok', 'Source fits hydraulic capacity', 'Calculated hydraulic capacity is ' + fmt(r.capacityMW, 0) + ' MW over one ' + fmt(p.spacing, 0) + ' km capacity section.')
      : check('warn', 'Source exceeds hydraulic capacity', 'The source is ' + fmt(p.srcMW, 0) + ' MW but one ' + fmt(p.spacing, 0) + ' km capacity section carries about ' + fmt(r.capacityMW, 0) + ' MW at this allowable drop. Raise the diameter, lower the spacing, or reduce the source.');
    h += r.deliveryOk
      ? check('ok', 'Delivery pressure met', 'Gas arrives at ' + fmt(r.pDelivered, 1) + ' bar, at or above the ' + fmt(p.pdel, 0) + ' bar minimum.')
      : check('warn', 'Delivery pressure below minimum', 'Gas arrives at ' + fmt(r.pDelivered, 1) + ' bar, below the ' + fmt(p.pdel, 0) + ' bar minimum. Raise the source pressure or add compression.');
    h += r.maopOk
      ? check('ok', 'Source pressure within MAOP', 'Source pressure ' + fmt(p.pin, 1) + ' bar is within the ' + fmt(r.maopBar, 1) + ' bar MAOP for ' + p.grade + ' and ' + fmt(p.wallMm, 1) + ' mm wall. The required wall at this pressure is ' + fmt(r.requiredWallMm, 1) + ' mm.')
      : check('warn', 'Source pressure above MAOP', 'Source pressure ' + fmt(p.pin, 1) + ' bar exceeds the ' + fmt(r.maopBar, 1) + ' bar MAOP for this grade and wall. The required wall is ' + fmt(r.requiredWallMm, 1) + ' mm.');
    h += r.penaltyPct <= p.maxpen
      ? check('ok', 'Energy penalty is ' + fmt(r.penaltyPct, 1) + '%', 'Routine H₂ leakage is ' + fmt(r.leakMW, 2) + ' MW and recompression electricity is ' + fmt(r.compMW, 2) + ' MW. Pressure drop itself is not counted as destroyed chemical energy.')
      : check('warn', 'Energy penalty above ' + fmt(p.maxpen, 0) + '%', 'Penalty is ' + fmt(r.penaltyPct, 1) + '%, above the set maximum.');
    h += r.lco <= p.thr
      ? check('ok', 'Transport cost is below the selected ceiling', 'Current levelised transport cost is ' + eur(r.lco) + '/kg versus ' + eur(p.thr) + '/kg.')
      : check('warn', 'Transport cost is above the selected ceiling', 'Current levelised transport cost is ' + eur(r.lco) + '/kg versus ' + eur(p.thr) + '/kg.');
    h += be !== null && be >= p.routeKm
      ? check('ok', 'Scenario passes to ' + fmt(be, 0) + ' km', 'This is the maximum passing distance in the current 50–5,000 km sweep, not a universal pipeline limit.')
      : check('warn', 'Scenario does not pass at this distance', 'The threshold is exceeded at the current route length for this throughput.');
    h += check('warn', 'Steady-state screening model', 'Friction, fittings, real-gas properties (NIST), Joule-Thomson and ground heat exchange are included. Transient flow, line-pack, elevation, impurities, fatigue and let-down energy recovery are not.');
    h += check('warn', 'Routine loss is separate from accidental release', 'Accidental buried-pipeline leaks and their consequences are not represented by the routine leakage percentage.');
    $('checks').innerHTML = h;
  }

  function chartDefaults() {
    var muted = css('--muted') || '#6d675c', line = css('--hair') || '#cfc8b8';
    if (window.Chart) {
      Chart.defaults.color = muted;
      Chart.defaults.borderColor = line;
      Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
    }
    return { muted: muted, line: line };
  }

  function makeOrUpdate(key, id, config) {
    if (!window.Chart) return;
    if (state.charts[key]) {
      state.charts[key].data = config.data;
      state.charts[key].options = config.options;
      state.charts[key].update();
    } else {
      state.charts[key] = new Chart($(id), config);
    }
  }

  function renderCharts(p, r) {
    if (!window.Chart) return;
    var c = chartDefaults();
    var blue = '#2d4a6b', green = '#c8452c', amber = '#1b1b1b', red = '#c8452c';

    // 1) Energy journey vs length
    var lens = [], chem = [], h2 = [], net = [];
    for (var L = 50; L <= 5000; L += 50) {
      var q = Object.assign({}, p, { routeKm: L });
      var e = H.evaluate(q);
      lens.push(L); chem.push(p.srcMW); h2.push(e.deliveredMW); net.push(e.deliveredMW - e.compMW);
    }
    makeOrUpdate('energy', 'chartEnergy', {
      type: 'line',
      data: { labels: lens, datasets: [
        { label: 'Chemical energy entering (MW)', data: chem, borderColor: c.muted, borderDash: [6, 4], pointRadius: 0, borderWidth: 2 },
        { label: 'H₂ energy at sink (MW)', data: h2, borderColor: blue, pointRadius: 0, borderWidth: 2.5 },
        { label: 'Net after compression (MW)', data: net, borderColor: green, pointRadius: 0, borderWidth: 2.5 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
        scales: { x: { title: { display: true, text: 'Pipeline length (km)' }, ticks: { maxTicksLimit: 10 } },
                  y: { title: { display: true, text: 'MW' }, beginAtZero: false } } }
    });

    // 2) Delivered energy vs source capacity
    var mw = [], dl = [], nt = [];
    for (var s = 100; s <= 2000; s += 100) {
      var q2 = Object.assign({}, p, { srcMW: s });
      var e2 = H.evaluate(q2);
      mw.push(s); dl.push(e2.deliveredMW); nt.push(e2.deliveredMW - e2.compMW);
    }
    var activeIdx = mw.indexOf(Math.round(p.srcMW / 100) * 100);
    var activeData = mw.map(function (v) { return v === Math.round(p.srcMW / 100) * 100 ? r.deliveredMW : null; });
    makeOrUpdate('flow', 'chartFlow', {
      type: 'line',
      data: { labels: mw, datasets: [
        { label: 'H₂ energy at sink (MW)', data: dl, borderColor: blue, pointRadius: 0, borderWidth: 2.5 },
        { label: 'Net after compression (MW)', data: nt, borderColor: green, pointRadius: 0, borderWidth: 2.5 },
        { label: 'Active case', data: activeData, borderColor: red, backgroundColor: red, pointRadius: 6, showLine: false }
      ] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
        scales: { x: { title: { display: true, text: 'Source capacity (MW)' } },
                  y: { title: { display: true, text: 'MW' } } } }
    });

    // 3) Cost vs distance
    var cl = [], cv = [], tl = [];
    for (var d = 50; d <= 5000; d += 50) {
      var q3 = Object.assign({}, p, { routeKm: d });
      cl.push(d); cv.push(H.evaluate(q3).lco); tl.push(p.thr);
    }
    makeOrUpdate('cost', 'chartCost', {
      type: 'line',
      data: { labels: cl, datasets: [
        { label: 'Levelised transport cost (£/kg)', data: cv, borderColor: amber, pointRadius: 0, borderWidth: 2.5 },
        { label: 'Threshold (£/kg)', data: tl, borderColor: red, borderDash: [6, 4], pointRadius: 0, borderWidth: 2 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
        scales: { x: { title: { display: true, text: 'Distance (km)' }, ticks: { maxTicksLimit: 12 } },
                  y: { title: { display: true, text: '£/kg' }, beginAtZero: true } } }
    });
  }

  function render() {
    var p = readParams();
    var err = validate(p);
    $('inputErr').textContent = err;
    if (err) return;
    var route = routeFromFields();
    $('routeName').textContent = route.srcName + ' to ' + route.sinkName;
    $('routeKm').textContent = fmt(p.routeKm, 0) + ' km (' + fmt(p.straightKm, 0) + ' km × ' + fmt(p.routeFactor, 2) + ')';

    var r = H.evaluate(p);
    $('kDelivered').innerHTML = fmt(r.deliveredMW, 0) + ' <small>MW</small>';
    $('kDeliveredNote').textContent = fmt(r.deliveredKgH, 0) + ' kg/h H₂ equivalent';
    $('kCoverage').textContent = fmt(r.coverage * 100, 0) + '%';
    $('kUnmet').textContent = fmt(r.unmetTpd, 1) + ' t/day unmet';
    $('kLco').innerHTML = eur(r.lco) + '<small>/kg</small>';
    var head = p.thr - r.lco;
    $('kHeadroom').textContent = (head >= 0 ? 'Headroom to threshold: ' : 'Over threshold by: ') + eur(Math.abs(head)) + '/kg';
    $('kComp').innerHTML = fmt(r.compMW, 2) + ' <small>MW</small>';
    $('kSections').textContent = r.stations === 0 ? 'no compressor needed' : r.stations + ' compressor station' + (r.stations === 1 ? '' : 's');
    $('kCapex').innerHTML = '£' + fmt(r.capex / 1e6, 1) + '<small>m</small>';
    $('kAnnual').textContent = 'annualised £' + fmt(r.annualCapex / 1e6, 1) + 'm/yr';
    $('kPenalty').innerHTML = fmt(r.penaltyPct, 1) + '%';
    $('kPenaltyNote').textContent = fmt(r.leakMW, 2) + ' MW leakage + ' + fmt(r.compMW, 2) + ' MW compression';

    renderTables(p, r);
    renderSensitivity(p, r);
    renderChecks(p, r);
    renderScenarios(p);
    renderGrid(p);
    renderCharts(p, r);
    drawMap();
  }


  // ---------- Sensitivity ----------
  // One input at a time, others held at the current values. Output: levelised cost (£/kg).
  // Ranges are either literature/source-based or stated assumptions; see `src`.
  var SENS = [
    { key: 'routeFactor', label: 'Route factor', lo: 1.10, hi: 1.40, fmt: function (v) { return fmt(v, 2); },
      secs: ['01', '02', '03', '08'],
      src: 'Literature 1.20–1.40 (arXiv 2505.01124). Not UK-specific.' },
    { key: 'capKm', label: 'Pipeline CAPEX (£/km, DN800)', rel: [0.7, 1.3], fmt: function (v) { return '£' + fmt(v / 1e6, 2) + 'm'; },
      secs: ['01', '03', '04', '08'],
      src: 'Single HyNet/Cadent project, restated to 2026. ±30% is an assumed range.' },
    { key: 'wacc', label: 'Discount rate (%)', lo: 5.18, hi: 9, fmt: function (v) { return fmt(v, 2) + '%'; },
      secs: ['01', '03', '04', '08'],
      src: '5.18% is the Ofgem final gas WACC (semi-nominal, regulated). 9% is an investor-risk assumption.' },
    { key: 'elec', label: 'Electricity (£/MWh)', lo: 120, hi: 220, fmt: function (v) { return '£' + fmt(v, 0); },
      secs: ['03', '08'],
      src: 'DESNZ Q4 2025 manufacturing £168/MWh. Range is an assumed ±30%.' },
    { key: 'pin', label: 'Source pressure (bar abs)', lo: 45, hi: 68.9, fmt: function (v) { return fmt(v, 1); },
      secs: ['03', '08'],
      src: 'NTS typically above 40 barg (National Gas). High end is the derived MAOP for X65, 16 mm wall.' },
    { key: 'pdel', label: 'Delivery pressure (bar abs)', lo: 8, hi: 46, fmt: function (v) { return fmt(v, 1); },
      secs: ['03', '08'],
      src: '39 bar abs = 38 barg offtake limit (Gas Governance OAD Section I). 8 bar abs is a low-pressure example; its basis is unverified.' },
    { key: 'dnMm', label: 'Diameter DN (mm)', lo: 700, hi: 900, fmt: function (v) { return fmt(v, 0); },
      secs: ['02', '03', '05', '08'],
      src: 'Design choice, not an input from a source.' },
    { key: 'dexp', label: 'Diameter scaling exponent', lo: 1.3, hi: 1.9, fmt: function (v) { return fmt(v, 2); },
      secs: ['03', '05', '08'],
      src: 'Assumed 1.6. No sourced exponent found for hydrogen pipelines in this study.' },
    { key: 'srcMW', label: 'Source capacity (MW, LHV)', lo: 500, hi: 1500, fmt: function (v) { return fmt(v, 0) + ' MW'; },
      secs: ['03', '06', '08'],
      src: 'Scenario range; not a sourced forecast.' },
    { key: 'util', label: 'Utilisation (%)', lo: 80, hi: 95, fmt: function (v) { return fmt(v, 0) + '%'; },
      secs: ['03', '06', '08'],
      src: '8,000 h/yr in the LH₂ carrier study (≈91%). Range is an assumption.' },
    { key: 'opex', label: 'Fixed OPEX (% of CAPEX/yr)', lo: 2, hi: 6, fmt: function (v) { return fmt(v, 1) + '%'; },
      secs: ['03', '08'],
      src: 'Assumed 4%. DESNZ uses 5% for compressor O&M, not pipeline.' },
    { key: 'life', label: 'Asset life (years)', lo: 25, hi: 40, fmt: function (v) { return fmt(v, 0); },
      secs: ['03', '08'],
      src: 'Assumption. Not sourced.' },
    { key: 'compKw', label: 'Compressor CAPEX (£/kW)', lo: 800, hi: 1500, fmt: function (v) { return '£' + fmt(v, 0); },
      secs: ['03', '08'],
      src: 'Placeholder. Matters only where compression is needed.' },
    { key: 'leak', label: 'Leakage (% per 1000 km)', lo: 0.1, hi: 0.5, fmt: function (v) { return fmt(v,2) + '%'; },
      secs: ['03', '08'],
      src: 'Not traced to a published source.' },
    { key: 'uW', label: 'Heat transfer to ground (W/m²K)', lo: 0.5, hi: 5, fmt: function (v) { return fmt(v, 1); },
      secs: ['03', '08'],
      src: 'Assumption. Affects temperature only.' },
    { key: 'groundC', label: 'Ground temperature (°C)', lo: 5.2, hi: 16, fmt: function (v) { return fmt(v, 1); },
      secs: ['03', '08'],
      src: 'BGS 1 m annual range, GR_999999/1 (2018).' },
    { key: 'tC', label: 'Gas temperature (°C)', lo: 5, hi: 25, fmt: function (v) { return fmt(v, 0); },
      secs: ['03', '08'],
      src: 'Assumption.' },
    { key: 'roughMm', label: 'Internal roughness (mm)', lo: 0.02, hi: 0.1, fmt: function (v) { return fmt(v,3); },
      secs: ['03', '08'],
      src: 'Assumption. Affects friction only.' },
    { key: 'bendsPerKm', label: 'Bends per km', lo: 0, hi: 0.5, fmt: function (v) { return fmt(v, 2); },
      secs: ['03', '08'],
      src: 'Assumption. Affects friction only.' }
  ];

  function sensOverride(p, s, val) {
    var q = Object.assign({}, p);
    q[s.key] = val;
    if (s.key === 'routeFactor') q.routeKm = q.straightKm * val;
    return q;
  }

  function sensRows(p) {
    var base = H.evaluate(p).lco;
    return SENS.map(function (s) {
      var lo = s.rel ? p[s.key] * s.rel[0] : s.lo;
      var hi = s.rel ? p[s.key] * s.rel[1] : s.hi;
      var cLo = H.evaluate(sensOverride(p, s, lo)).lco;
      var cHi = H.evaluate(sensOverride(p, s, hi)).lco;
      return { s: s, base: base, baseVal: p[s.key], lo: lo, hi: hi, cLo: cLo, cHi: cHi, swing: Math.abs(cHi - cLo) };
    });
  }

  function renderSensitivity(p) {
    var rows = sensRows(p);
    var secIds = ['01', '02', '03', '04', '05', '06', '07', '08'];
    secIds.forEach(function (sec) {
      var el = $('sens-' + sec);
      if (!el) return;
      var list = rows.filter(function (r) { return r.s.secs.indexOf(sec) !== -1; });
      if (sec === '08') list = rows;
      if (sec === '01') list = list.filter(function (r) { return ['routeFactor', 'capKm', 'wacc', 'elec'].indexOf(r.s.key) !== -1; });
      if (!list.length) { el.innerHTML = ''; return; }
      var h = '<table><thead><tr><th>Input</th><th class="num">Current</th><th class="num">Tested</th>' +
        '<th class="num">LCO low</th><th class="num">LCO high</th><th class="num">Swing</th>' +
        (sec === '08' ? '<th>Source and status</th>' : '') + '</tr></thead><tbody>';
      list.forEach(function (r) {
        h += '<tr><td>' + r.s.label + '</td>' +
          '<td class="num">' + r.s.fmt(r.baseVal) + '</td>' +
          '<td class="num">' + r.s.fmt(r.lo) + ' – ' + r.s.fmt(r.hi) + '</td>' +
          '<td class="num">' + eur(r.cLo) + '</td><td class="num">' + eur(r.cHi) + '</td>' +
          '<td class="num">' + eur(r.swing) + '</td>' +
          (sec === '08' ? '<td><small>' + r.s.src + '</small></td>' : '') + '</tr>';
      });
      el.innerHTML = h + '</tbody></table><p class="note">Base case ' + eur(rows[0].base) + '/kg. Each row changes one input; others are held at their current values.</p>';
    });
  }

  var debounceTimer = null;
  function scheduleRender() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 150);
  }

  function init() {
    setRouteFields(presetRoute(PRESETS[0]));
    initMap();
    $('recalc').addEventListener('click', render);
    $('applyRoute').addEventListener('click', function () {
      var r = routeFromFields();
      if (!isFinite(r.routeKm) || r.routeKm <= 0) { $('inputErr').textContent = 'Route length must be positive.'; return; }
      state.fitted = false; drawMap(); render();
    });
    $('resetRoute').addEventListener('click', function () {
      setRouteFields(presetRoute(PRESETS[Number($('preset').value) || 0]));
      state.fitted = false; drawMap(); render();
    });
    var sel = $('preset');
    PRESETS.forEach(function (pr, i) {
      var o = document.createElement('option');
      o.value = i; o.textContent = pr.label; sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      setRouteFields(presetRoute(PRESETS[Number(sel.value)]));
      state.fitted = false; drawMap(); render();
    });
    $('swap').addEventListener('click', function () {
      var r = routeFromFields();
      setRouteFields({ srcName: r.sinkName, srcLat: r.sinkLat, srcLon: r.sinkLon,
        sinkName: r.srcName, sinkLat: r.srcLat, sinkLon: r.srcLon, routeKm: r.routeKm });
      drawMap(); render();
    });
    $('setSrc').addEventListener('click', function () { setMode(state.mode === 'src' ? null : 'src'); });
    $('setSink').addEventListener('click', function () { setMode(state.mode === 'sink' ? null : 'sink'); });
    document.querySelectorAll('input').forEach(function (el) {
      el.addEventListener('input', scheduleRender);
    });
    document.querySelectorAll('select#mode, select#grade').forEach(function (el) {
      el.addEventListener('change', scheduleRender);
    });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
