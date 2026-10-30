/* UI wiring for the Hydrogen Pipeline Techno-Economic Workbench. Depends on model.js. */
(function () {
  'use strict';
  var H = window.H2Model;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (x, d) { return Number(x).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var eur = function (x, d) { return 'EUR ' + fmt(x, d === undefined ? 2 : d); };
  var css = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };

  var DEFAULT_ROUTE = {
    srcName: 'Rotterdam Maasvlakte', srcLat: 51.955, srcLon: 3.980,
    sinkName: 'Geleen (Chemelot)', sinkLat: 50.975, sinkLon: 5.810, routeKm: 167
  };

  var state = { map: null, srcMarker: null, sinkMarker: null, line: null, mode: null, charts: {} };

  function num(id) { return Number($(id).value); }

  function readParams() {
    return {
      routeKm: num('routeKmIn'), leak: num('leak'), srcMW: num('srcMW'), dnMm: num('dn'),
      pin: num('pin'), pout: num('pout'), tC: num('tC'), z: num('z'), roughMm: num('rough'),
      eff: num('eff'), vmax: num('vmax'), spacing: num('spacing'), ceff: num('ceff'),
      capKm: num('capKm'), dexp: num('dexp'), refDn: num('refDn'), compKw: num('compKw'),
      opex: num('opex'), elec: num('elec'), life: num('life'), wacc: num('wacc'),
      util: num('util'), demand: num('demand'), thr: num('thr'), maxpen: num('maxpen')
    };
  }

  function validate(p) {
    var keys = Object.keys(p);
    for (var i = 0; i < keys.length; i++) {
      if (!isFinite(p[keys[i]])) return 'Enter a number in every field.';
    }
    if (p.routeKm <= 0) return 'Route length must be positive.';
    if (p.dnMm <= 0 || p.refDn <= 0) return 'Diameter must be positive.';
    if (p.pin <= p.pout) return 'Inlet pressure must be above outlet pressure.';
    if (p.pout <= 0) return 'Outlet pressure must be positive.';
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
      state.line = L.polyline([s, t], { color: '#4aa8ff', weight: 4, opacity: 0.85 }).addTo(state.map);
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
      fmt(r.coverage * 100, 0) + '%</td><td>' + eur(r.lco) + '/kg</td><td>EUR ' + fmt(r.capex / 1e6, 1) + 'm</td></tr>';
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
      row('Section pressure ratio', fmt(r.ratio, 2)) +
      row('Compressor stations', r.stations + ' (section ' + fmt(r.sectionKm, 0) + ' km)') +
      row('Hydraulic capacity (per section)', fmt(r.capacityMW, 0) + ' MW') +
      row('Net annual delivery', fmt(r.annualKt, 1) + ' kt/yr') +
      row('Break-even distance (threshold)', (H.breakEvenKm(p) === null ? 'below 50 km' : fmt(H.breakEvenKm(p), 0) + ' km'));
    $('comTable').innerHTML =
      row('Compressor electricity cost', 'EUR ' + fmt(r.elecCost / 1e6, 1) + 'm/yr') +
      row('Fixed OPEX', 'EUR ' + fmt(r.fixedOpex / 1e6, 1) + 'm/yr') +
      row('Annualised CAPEX', 'EUR ' + fmt(r.annualCapex / 1e6, 1) + 'm/yr') +
      row('Total annual cost', 'EUR ' + fmt(r.totalAnnual / 1e6, 1) + 'm/yr') +
      row('Pipeline CAPEX', 'EUR ' + fmt(r.pipeCapex / 1e6, 1) + 'm') +
      row('Compressor CAPEX', 'EUR ' + fmt(r.compCapex / 1e6, 1) + 'm') +
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
    h += check('warn', 'Dedicated hydrogen design', 'Purpose-built H₂ service is assumed. Reviewed examples operate near 65 bar(g); that is context, not a universal design limit.');
    h += p.srcMW <= r.capacityMW
      ? check('ok', 'Source fits hydraulic capacity', 'Calculated hydraulic capacity is ' + fmt(r.capacityMW, 0) + ' MW for approximately ' + fmt(r.sectionKm, 0) + ' km per pressure section.')
      : check('warn', 'Source exceeds hydraulic capacity', 'The source is ' + fmt(p.srcMW, 0) + ' MW but one section carries about ' + fmt(r.capacityMW, 0) + ' MW at this pressure drop. Add stations, raise the diameter, or reduce the source.');
    h += r.penaltyPct <= p.maxpen
      ? check('ok', 'Energy penalty is ' + fmt(r.penaltyPct, 1) + '%', 'Routine H₂ leakage is ' + fmt(r.leakMW, 2) + ' MW and recompression electricity is ' + fmt(r.compMW, 2) + ' MW. Pressure drop itself is not counted as destroyed chemical energy.')
      : check('warn', 'Energy penalty above ' + fmt(p.maxpen, 0) + '%', 'Penalty is ' + fmt(r.penaltyPct, 1) + '%, above the set maximum.');
    h += r.lco <= p.thr
      ? check('ok', 'Transport cost is below the selected ceiling', 'Current levelised transport cost is ' + eur(r.lco) + '/kg versus ' + eur(p.thr) + '/kg.')
      : check('warn', 'Transport cost is above the selected ceiling', 'Current levelised transport cost is ' + eur(r.lco) + '/kg versus ' + eur(p.thr) + '/kg.');
    h += be !== null && be >= p.routeKm
      ? check('ok', 'Scenario passes to ' + fmt(be, 0) + ' km', 'This is the maximum passing distance in the current 50–5,000 km sweep, not a universal pipeline limit.')
      : check('warn', 'Scenario does not pass at this distance', 'The threshold is exceeded at the current route length for this throughput.');
    h += check('warn', 'Steady-state screening model', 'Real-gas, friction, transient and leakage complexity is simplified. Elevation, fittings, impurities and fatigue life are outside this screen.');
    h += check('warn', 'Routine loss is separate from accidental release', 'Accidental buried-pipeline leaks and their consequences are not represented by the routine leakage percentage.');
    $('checks').innerHTML = h;
  }

  function chartDefaults() {
    var muted = css('--muted') || '#8ea3b8', line = css('--line') || '#1f3347';
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
    var blue = '#4aa8ff', green = '#50d59a', amber = '#f0b44c', red = '#ef6461';

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
        { label: 'Levelised transport cost (EUR/kg)', data: cv, borderColor: amber, pointRadius: 0, borderWidth: 2.5 },
        { label: 'Threshold (EUR/kg)', data: tl, borderColor: red, borderDash: [6, 4], pointRadius: 0, borderWidth: 2 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
        scales: { x: { title: { display: true, text: 'Distance (km)' }, ticks: { maxTicksLimit: 12 } },
                  y: { title: { display: true, text: 'EUR/kg' }, beginAtZero: true } } }
    });
  }

  function render() {
    var p = readParams();
    var err = validate(p);
    $('inputErr').textContent = err;
    if (err) return;
    var route = routeFromFields();
    $('routeName').textContent = route.srcName + ' to ' + route.sinkName;
    $('routeKm').textContent = fmt(p.routeKm, 0) + ' km';

    var r = H.evaluate(p);
    $('kDelivered').innerHTML = fmt(r.deliveredMW, 0) + ' <small>MW</small>';
    $('kDeliveredNote').textContent = fmt(r.deliveredKgH, 0) + ' kg/h H₂ equivalent';
    $('kCoverage').textContent = fmt(r.coverage * 100, 0) + '%';
    $('kUnmet').textContent = fmt(r.unmetTpd, 1) + ' t/day unmet';
    $('kLco').innerHTML = eur(r.lco) + '<small>/kg</small>';
    var head = p.thr - r.lco;
    $('kHeadroom').textContent = (head >= 0 ? 'Headroom to threshold: ' : 'Over threshold by: ') + eur(Math.abs(head)) + '/kg';
    $('kComp').innerHTML = fmt(r.compMW, 2) + ' <small>MW</small>';
    $('kSections').textContent = r.stations + ' repeated pressure section' + (r.stations === 1 ? '' : 's');
    $('kCapex').innerHTML = 'EUR ' + fmt(r.capex / 1e6, 1) + '<small>m</small>';
    $('kAnnual').textContent = 'annualised EUR ' + fmt(r.annualCapex / 1e6, 1) + 'm/yr';
    $('kPenalty').innerHTML = fmt(r.penaltyPct, 1) + '%';
    $('kPenaltyNote').textContent = fmt(r.leakMW, 2) + ' MW leakage + ' + fmt(r.compMW, 2) + ' MW compression';

    renderTables(p, r);
    renderChecks(p, r);
    renderScenarios(p);
    renderGrid(p);
    renderCharts(p, r);
    drawMap();
  }

  var debounceTimer = null;
  function scheduleRender() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 150);
  }

  function init() {
    setRouteFields(DEFAULT_ROUTE);
    initMap();
    $('recalc').addEventListener('click', render);
    $('applyRoute').addEventListener('click', function () {
      var r = routeFromFields();
      if (!isFinite(r.routeKm) || r.routeKm <= 0) { $('inputErr').textContent = 'Route length must be positive.'; return; }
      state.fitted = false; drawMap(); render();
    });
    $('resetRoute').addEventListener('click', function () {
      setRouteFields(DEFAULT_ROUTE); state.fitted = false; drawMap(); render();
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
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
