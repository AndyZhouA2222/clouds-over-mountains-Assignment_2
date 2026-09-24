'use strict';
(() => {
  const data = window.CLOUD_ATLAS_DATA;
  const cth = window.CLOUD_ATLAS_CTH;
  const $ = (id) => document.getElementById(id);
  const state = { day: data.days.length - 1, hour: 12, layer: 'natural', zoom: 1, playing: false };
  let timer = null;
  const mapWidth = data.map.width; const mapHeight = data.map.height; const bbox = data.map.bbox;
  const mercX = (lon) => lon * 20037508.34 / 180;
  const mercY = (lat) => Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180;
  const frame = () => data.days[state.day].frames[state.hour];
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const fileDate = (date) => `${date.slice(5, 7)} / ${date.slice(8, 10)}`;
  const fullDate = (date) => `${date.slice(0, 4)} 年 ${Number(date.slice(5, 7))} 月 ${Number(date.slice(8, 10))} 日`;

  function toPixel(lon, lat) { return { x: (mercX(lon) - bbox[0]) / (bbox[2] - bbox[0]) * mapWidth, y: (bbox[3] - mercY(lat)) / (bbox[3] - bbox[1]) * mapHeight }; }
  function renderDayStrip() {
    $('day-strip').innerHTML = data.days.map((day, index) => `<button class="day-choice ${index === state.day ? 'selected' : ''}" data-day="${index}" aria-pressed="${index === state.day}"><span>${fileDate(day.date)}</span><strong>${day.maxDelta.toFixed(1)}°</strong><small>ΔT 峰值</small></button>`).join('');
  }
  function renderMapMarkers() {
    const stations = data.stations.map((station) => ({ ...station, label: station.id === '05792' ? 'Zugspitze' : 'Garmisch', type: 'station' }));
    $('map-markers').innerHTML = stations.map((station) => { const p = toPixel(station.lon, station.lat); return `<span class="map-marker ${station.id === '05792' ? 'summit' : 'valley'}" style="left:${p.x / mapWidth * 100}%;top:${p.y / mapHeight * 100}%"><i></i><b>${station.label}</b></span>`; }).join('');
  }
  function drawCloudReference() {
    const canvas = $('cloud-canvas'); const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, mapWidth, mapHeight);
    if (!cth?.frames?.length) return;
    const selected = cth.frames.reduce((best, current) => Math.abs(current.hour - state.hour) < Math.abs(best.hour - state.hour) ? current : best, cth.frames[0]);
    const lats = cth.latitudes; const lons = cth.longitudes;
    for (let row = 0; row < lats.length; row += 1) for (let col = 0; col < lons.length; col += 1) {
      const height = selected.values[row][col]; const opacity = selected.opacity[row][col]; if (height <= 0 || opacity <= 0) continue;
      const t = clamp((height - 500) / 8500, 0, 1); const x = (mercX(lons[col]) - bbox[0]) / (bbox[2] - bbox[0]) * mapWidth; const xNext = (mercX(lons[Math.min(col + 1, lons.length - 1)]) - bbox[0]) / (bbox[2] - bbox[0]) * mapWidth;
      const yRaw = (bbox[3] - mercY(lats[row])) / (bbox[3] - bbox[1]) * mapHeight; const yNext = (bbox[3] - mercY(lats[Math.min(row + 1, lats.length - 1)])) / (bbox[3] - bbox[1]) * mapHeight;
      ctx.fillStyle = `rgba(${Math.round(58 + t * 190)},${Math.round(180 - t * 95)},${Math.round(211 - t * 90)},${Math.min(.85, .2 + opacity / 180)})`; ctx.fillRect(x, Math.min(yRaw, yNext), Math.abs(xNext - x) + 1, Math.abs(yNext - yRaw) + 1);
    }
  }
  function renderMap() {
    const day = data.days[state.day]; const terrain = data.map.terrain;
    $('map-image').src = state.layer === 'terrain' || state.layer === 'height' ? terrain : day.image;
    $('map-image').alt = state.layer === 'natural' ? `${day.date} NASA VIIRS 真彩色日合成影像` : 'Esri World Imagery 地形参考底图';
    $('map-image').classList.toggle('terrain-image', state.layer !== 'natural'); $('cloud-canvas').hidden = state.layer !== 'height'; $('height-legend').hidden = state.layer !== 'height';
    $('map-date').textContent = state.layer === 'height' ? '22 / 09 / 2026' : fileDate(day.date) + ' / 2026';
    $('map-time').textContent = state.layer === 'natural' ? 'DAILY COMPOSITE' : state.layer === 'terrain' ? 'REFERENCE TERRAIN' : 'CTH REFERENCE · 22 SEP';
    $('map-caption').textContent = state.layer === 'natural' ? 'NASA VIIRS · 真彩色日合成 · 日期影像' : state.layer === 'terrain' ? 'Esri World Imagery · 日期未知' : `DWD CTH · 9 月 22 日 · ${String(Math.max(6, Math.min(18, state.hour))).padStart(2, '0')}:08 UTC`;
    $('map-note').textContent = state.layer === 'height' ? '云高档案当前只保留 9 月 22 日；不与 9 月 14–20 日混合比较。' : '每日影像只说明这一天的云形态，不代表当前整点。';
    document.querySelectorAll('[data-layer]').forEach((button) => button.setAttribute('aria-pressed', button.dataset.layer === state.layer));
    if (state.layer === 'height') drawCloudReference(); renderMapMarkers();
  }
  function renderReadings() {
    const current = frame(); const day = data.days[state.day]; $('selected-date').textContent = `${day.date.slice(8, 10)} SEP`;
    $('day-summary').textContent = `${fullDate(day.date)} · 24 个整点全部配对。`;
    $('delta-peak').textContent = day.maxDelta.toFixed(1); const peak = day.frames.find((f) => f.delta === day.maxDelta);
    $('valley-now').textContent = current.valley == null ? '—' : current.valley.toFixed(1); $('summit-now').textContent = current.summit == null ? '—' : current.summit.toFixed(1); $('reading-time').textContent = `${String(state.hour).padStart(2, '0')}:00 UTC`;
    $('delta-range').textContent = `${day.minDelta.toFixed(1)}—${day.maxDelta.toFixed(1)} °C`; $('selected-time').innerHTML = `${String(state.hour).padStart(2, '0')}:00 <small>UTC</small>`; $('time-slider').value = state.hour;
  }
  function pathFor(frames, key, width, height, pad, min, max, denominator = 23) { return frames.map((item, index) => { if (item[key] == null) return null; const x = pad.left + index / denominator * (width - pad.left - pad.right); const y = pad.top + (max - item[key]) / (max - min) * (height - pad.top - pad.bottom); return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).filter(Boolean).join(' '); }
  function renderChart() {
    const svg = $('analysis-chart'); const width = Math.max(620, svg.parentElement.clientWidth || 900); const height = 220; const pad = { left: 43, right: 18, top: 17, bottom: 30 }; const values = data.days.flatMap((d) => d.frames.map((f) => f.delta)).filter((value) => value != null); const min = Math.floor(Math.min(...values) - 2); const max = Math.ceil(Math.max(...values) + 2);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.innerHTML = ''; for (let tick = min; tick <= max; tick += 5) { const y = pad.top + (max - tick) / (max - min) * (height - pad.top - pad.bottom); svg.insertAdjacentHTML('beforeend', `<line class="chart-grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}"/><text class="chart-axis" x="${pad.left - 9}" y="${y + 4}" text-anchor="end">${tick}</text>`); }
    const dailyPath = data.days.map((d, index) => { const x = pad.left + index / 6 * (width - pad.left - pad.right); const y = pad.top + (max - d.maxDelta) / (max - min) * (height - pad.top - pad.bottom); return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join(' '); const hourlyPath = pathFor(data.days[state.day].frames, 'delta', width, height, pad, min, max);
    const cursorX = pad.left + state.day / 6 * (width - pad.left - pad.right); svg.insertAdjacentHTML('beforeend', `<path class="daily-line" d="${dailyPath}"/><path class="selected-line" d="${hourlyPath}"/><line class="day-cursor" x1="${cursorX}" x2="${cursorX}" y1="${pad.top}" y2="${height - pad.bottom}"/><text class="chart-label" x="${pad.left}" y="${height - 7}">14 SEP</text><text class="chart-label" x="${width / 2}" y="${height - 7}" text-anchor="middle">17 SEP</text><text class="chart-label" x="${width - pad.right}" y="${height - 7}" text-anchor="end">20 SEP</text>`);
  }
  function render() { renderDayStrip(); renderReadings(); renderMap(); renderChart(); }
  function updateProvenanceCopy() {
    const sections = document.querySelectorAll('#data-dialog .dialog-body section');
    if (sections[0]) sections[0].querySelector('p').textContent = '01550 Garmisch-Partenkirchen（719 m）与 05792 Zugspitze（2,956 m），2026-09-14 至 20，共 336 条小时记录，168 组配对。原始时间为 UTC，单位 °C，缺测不插补。';
    if (sections[2]) sections[2].querySelector('p').textContent = '14–20 日 Suomi NPP / VIIRS 真彩色日合成影像。地形参考为 Esri World Imagery 拼接底图，日期未知。两种底图都保持 1440×900 EPSG:3857 比例。';
  }
  function setDay(index) { state.day = Number(index); state.hour = 12; state.layer = state.layer === 'height' ? 'natural' : state.layer; render(); }
  function setZoom(next) { state.zoom = clamp(next, 1, 2.25); $('map-world').style.transform = `scale(${state.zoom})`; $('zoom-in').disabled = state.zoom >= 2.25; $('zoom-out').disabled = state.zoom <= 1; }
  function stopPlayback() { clearInterval(timer); timer = null; state.playing = false; $('play-button').setAttribute('aria-label', '播放时间序列'); $('play-button').innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6Z"/></svg>'; }
  function togglePlayback() { if (state.playing) return stopPlayback(); state.playing = true; $('play-button').setAttribute('aria-label', '暂停时间序列'); $('play-button').innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4h3v12H5zm7 0h3v12h-3z"/></svg>'; timer = setInterval(() => { state.hour = state.hour >= 23 ? 0 : state.hour + 1; renderReadings(); renderChart(); if (state.layer === 'height') drawCloudReference(); }, 700); }
  document.addEventListener('click', (event) => { const day = event.target.closest('[data-day]'); if (day) return setDay(day.dataset.day); const layer = event.target.closest('[data-layer]'); if (layer) { state.layer = layer.dataset.layer; return renderMap(); } });
  $('time-slider').addEventListener('input', (event) => { stopPlayback(); state.hour = Number(event.target.value); renderReadings(); renderChart(); if (state.layer === 'height') drawCloudReference(); }); $('play-button').addEventListener('click', togglePlayback);
  $('zoom-in').addEventListener('click', () => setZoom(state.zoom + .25)); $('zoom-out').addEventListener('click', () => setZoom(state.zoom - .25)); $('reset-map').addEventListener('click', () => setZoom(1)); $('map-frame').addEventListener('wheel', (event) => { event.preventDefault(); setZoom(state.zoom + (event.deltaY < 0 ? .1 : -.1)); }, { passive: false });
  $('about-button').addEventListener('click', () => $('data-dialog').showModal()); $('close-dialog').addEventListener('click', () => $('data-dialog').close()); $('map-image').addEventListener('error', () => $('map-error').hidden = false); window.addEventListener('resize', renderChart); document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); });
  setZoom(1); updateProvenanceCopy(); render();
})();
