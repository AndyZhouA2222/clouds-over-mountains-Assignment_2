'use strict';
(() => {
  const data = window.CLOUD_ATLAS_DATA;
  const cth = window.CLOUD_ATLAS_CTH;
  const $ = (id) => document.getElementById(id);
  const state = { day: data.days.length - 1, hour: 12, cthIndex: 0, zoom: 1, playing: false };
  let timer = null;
  const mapWidth = data.map.width; const mapHeight = data.map.height; const bbox = data.map.bbox;
  const mercX = (lon) => lon * 20037508.34 / 180;
  const mercY = (lat) => Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180;
  const frame = () => data.days[state.day].frames[state.hour];
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const fileDate = (date) => `${date.slice(5, 7)} / ${date.slice(8, 10)}`;
  const fullDate = (date) => `${date.slice(0, 4)} 年 ${Number(date.slice(5, 7))} 月 ${Number(date.slice(8, 10))} 日`;
  const cthStats = (cth?.frames || []).map((item) => {
    const heights = item.values.flatMap((row, rowIndex) => row.filter((height, colIndex) => height > 0 && item.opacity[rowIndex][colIndex] > 0)).sort((a, b) => a - b);
    const quantile = (fraction) => heights.length ? heights[Math.floor((heights.length - 1) * fraction)] : null;
    const bins = Array(10).fill(0);
    for (const value of heights) bins[clamp(Math.floor(value / 500), 0, 9)] += 1;
    return { hour: item.hour, count: heights.length, p10: quantile(.1), median: quantile(.5), p90: quantile(.9), bins };
  });

  function toPixel(lon, lat) { return { x: (mercX(lon) - bbox[0]) / (bbox[2] - bbox[0]) * mapWidth, y: (bbox[3] - mercY(lat)) / (bbox[3] - bbox[1]) * mapHeight }; }
  function renderDayStrip() {
    $('day-strip').innerHTML = data.days.map((day, index) => `<button class="day-choice ${index === state.day ? 'selected' : ''}" data-day="${index}" aria-pressed="${index === state.day}"><span>${fileDate(day.date)}</span><strong>${day.maxDelta.toFixed(1)}°</strong><small>ΔT 峰值</small></button>`).join('');
  }
  function renderMapMarkers() {
    const stations = data.stations.map((station) => ({ ...station, label: station.id === '05792' ? 'Zugspitze' : 'Garmisch', type: 'station' }));
    const html = stations.map((station) => { const p = toPixel(station.lon, station.lat); return `<span class="map-marker ${station.id === '05792' ? 'summit' : 'valley'}" style="left:${p.x / mapWidth * 100}%;top:${p.y / mapHeight * 100}%"><i></i><b>${station.label}</b></span>`; }).join('');
    $('map-markers').innerHTML = html; $('cth-markers').innerHTML = html;
  }
  function fitMapToFrames() {
    for (const [panelId, worldId] of [['viirs-panel', 'map-world'], ['cth-panel', 'cth-world']]) {
      const viewport = $(panelId); const world = $(worldId); const scale = Math.min(viewport.clientWidth / mapWidth, viewport.clientHeight / mapHeight);
      const width = mapWidth * scale; const height = mapHeight * scale;
      world.style.width = `${width}px`; world.style.height = `${height}px`;
      world.style.left = `${(viewport.clientWidth - width) / 2}px`; world.style.top = `${(viewport.clientHeight - height) / 2}px`;
    }
  }
  function drawCloudReference() {
    const canvas = $('cloud-canvas'); const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, mapWidth, mapHeight);
    if (!cth?.frames?.length) return;
    const selected = cth.frames[state.cthIndex];
    const lats = cth.latitudes; const lons = cth.longitudes; const step = cth.gridDegrees || .03;
    for (let row = 0; row < lats.length; row += 1) for (let col = 0; col < lons.length; col += 1) {
      const height = selected.values[row][col]; const opacity = selected.opacity[row][col]; if (height <= 0 || opacity <= 0) continue;
      const west = (mercX(lons[col] - step / 2) - bbox[0]) / (bbox[2] - bbox[0]) * mapWidth;
      const east = (mercX(lons[col] + step / 2) - bbox[0]) / (bbox[2] - bbox[0]) * mapWidth;
      const north = (bbox[3] - mercY(lats[row] + step / 2)) / (bbox[3] - bbox[1]) * mapHeight;
      const south = (bbox[3] - mercY(lats[row] - step / 2)) / (bbox[3] - bbox[1]) * mapHeight;
      const color = height < 1500 ? '72,128,173' : height < 2500 ? '51,184,181' : height < 3500 ? '125,216,154' : height < 4500 ? '239,198,91' : '243,132,94';
      ctx.fillStyle = `rgba(${color},${.22 + .42 * opacity / 100})`;
      ctx.fillRect(west, north, east - west, south - north);
    }
  }
  function renderCthChart() {
    const svg = $('cth-chart'); if (!svg || !cthStats.length) return;
    const width = Math.max(1, svg.parentElement.clientWidth || 700); const height = 180;
    const pad = { left: 45, right: 12, top: 10, bottom: 26 }; const maxHeight = 5000;
    const plotWidth = width - pad.left - pad.right; const plotHeight = height - pad.top - pad.bottom;
    const x = (index) => pad.left + (index + .5) / cthStats.length * plotWidth;
    const y = (value) => pad.top + (maxHeight - value) / maxHeight * plotHeight;
    const selectedIndex = state.cthIndex;
    const maxShare = Math.max(...cthStats.flatMap((stat) => stat.bins.map((count) => count / Math.max(1, stat.count))));
    const colors = ['72,128,173', '51,184,181', '125,216,154', '239,198,91', '243,132,94'];
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.innerHTML = '';
    for (let tick = 0; tick <= 5; tick += 1) { const py = y(tick * 1000); svg.insertAdjacentHTML('beforeend', `<line class="cth-grid" x1="${pad.left}" x2="${width - pad.right}" y1="${py}" y2="${py}"/><text class="cth-axis" x="${pad.left - 8}" y="${py + 3}" text-anchor="end">${tick}</text>`); }
    cthStats.forEach((stat, index) => stat.bins.forEach((count, bin) => {
      const share = count / Math.max(1, stat.count); const band = bin < 3 ? 0 : bin < 5 ? 1 : bin < 7 ? 2 : bin < 9 ? 3 : 4;
      const cellX = pad.left + index / cthStats.length * plotWidth; const cellY = y((bin + 1) * 500); const cellHeight = plotHeight / 10;
      svg.insertAdjacentHTML('beforeend', `<rect class="cth-cell" x="${cellX + .6}" y="${cellY + .4}" width="${Math.max(1, plotWidth / cthStats.length - 1.2)}" height="${Math.max(1, cellHeight - .8)}" fill="rgb(${colors[band]})" fill-opacity="${share ? .08 + .86 * Math.sqrt(share / maxShare) : .025}"/>`);
    }));
    const median = cthStats.map((stat, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(stat.median ?? 0).toFixed(1)}`).join(' ');
    const labels = [0, 3, 6, 9, 12]; labels.forEach((index) => svg.insertAdjacentHTML('beforeend', `<text class="cth-axis" x="${x(index)}" y="${height - 5}" text-anchor="middle">${String(cthStats[index].hour).padStart(2, '0')}</text>`));
    const cursorX = x(selectedIndex);
    svg.insertAdjacentHTML('beforeend', `<path class="cth-median-line" d="${median}"/><line class="cth-cursor" x1="${cursorX}" x2="${cursorX}" y1="${pad.top}" y2="${height - pad.bottom}"/><circle class="cth-point" cx="${cursorX}" cy="${y(cthStats[selectedIndex].median ?? 0)}" r="4"/>`);
    const item = cthStats[selectedIndex]; const frameUtc = cth.frames[selectedIndex].utc;
    $('cth-median').textContent = item.median == null ? '无有效值' : `${(item.median / 1000).toFixed(2)} km`;
    $('cth-frame-label').textContent = `${frameUtc.slice(11, 16)} UTC`;
    $('cth-slider-time').textContent = `${frameUtc.slice(11, 16)} UTC`;
    $('cth-range-note').textContent = `P10–P90 ${(item.p10 / 1000).toFixed(1)}–${(item.p90 / 1000).toFixed(1)} km · 有效格点 ${item.count} / ${cth.latitudes.length * cth.longitudes.length}`;
    $('cth-map-time').textContent = `${frameUtc.slice(11, 16)} UTC`;
    $('cth-map-median').textContent = item.median == null ? '—' : `${(item.median / 1000).toFixed(2)} km`;
    $('cth-map-valid').textContent = `有效格点 ${item.count} / ${cth.latitudes.length * cth.longitudes.length}`;
    $('cth-slider').value = selectedIndex;
    svg.setAttribute('aria-valuemin', '0');
    svg.setAttribute('aria-valuemax', String(cthStats.length - 1));
    svg.setAttribute('aria-valuenow', String(selectedIndex));
    svg.setAttribute('aria-valuetext', `${frameUtc.slice(11, 16)} UTC，区域中位数 ${item.median == null ? '无有效值' : `${(item.median / 1000).toFixed(2)} km`}`);
  }
  function selectCthFrame(index) {
    state.cthIndex = clamp(Number(index), 0, cthStats.length - 1);
    renderCthChart();
    drawCloudReference();
  }
  function renderMap() {
    const day = data.days[state.day];
    $('map-image').src = day.image; $('map-image').alt = `${day.date} NASA VIIRS 真彩色日合成影像`;
    $('cth-image').src = data.map.terrain;
    $('map-date').textContent = `${fileDate(day.date)} / 2026`;
    $('scene-index').textContent = `FIELD ${String(state.day + 1).padStart(2, '0')} / 07`;
    $('scene-date').innerHTML = `${day.date.slice(8, 10)}<span>SEP</span>`;
    $('map-frame').dataset.day = day.date;
    drawCloudReference(); renderCthChart(); renderMapMarkers();
  }
  function renderReadings() {
    const current = frame(); const day = data.days[state.day]; $('selected-date').textContent = `${day.date.slice(8, 10)} SEP`;
    $('day-summary').textContent = `${fullDate(day.date)} · 24 个整点配对`;
    $('delta-peak').textContent = day.maxDelta.toFixed(1); const peak = day.frames.find((f) => f.delta === day.maxDelta); $('peak-time').textContent = `${String(peak?.hour ?? 0).padStart(2, '0')}:00 UTC`;
    $('valley-now').textContent = current.valley == null ? '—' : current.valley.toFixed(1); $('summit-now').textContent = current.summit == null ? '—' : current.summit.toFixed(1); $('reading-time').textContent = `${String(state.hour).padStart(2, '0')}:00 UTC`;
    $('live-delta').textContent = current.delta == null ? '—' : current.delta.toFixed(1);
    $('scene-index').textContent = `FIELD ${String(state.day + 1).padStart(2, '0')} / 07`;
    $('scene-date').innerHTML = `${day.date.slice(8, 10)}<span>SEP</span>`; $('selected-time').innerHTML = `${String(state.hour).padStart(2, '0')}:00 <small>UTC</small>`; $('time-slider').value = state.hour;
    renderCthChart();
  }
  function pathFor(frames, key, width, height, pad, min, max, denominator = 23) {
    const commands = [];
    let drawing = false;
    frames.forEach((item, index) => {
      const value = item[key];
      if (value == null || !Number.isFinite(value)) { drawing = false; return; }
      const x = pad.left + index / denominator * (width - pad.left - pad.right);
      const y = pad.top + (max - value) / (max - min) * (height - pad.top - pad.bottom);
      commands.push(`${drawing ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
      drawing = true;
    });
    return commands.join(' ');
  }
  function renderChart() {
    const svg = $('analysis-chart'); const width = Math.max(1, svg.parentElement.clientWidth || 900); const height = 220; const pad = { left: 43, right: 18, top: 17, bottom: 30 }; const values = data.days.flatMap((d) => d.frames.map((f) => f.delta)).filter((value) => value != null); const min = Math.floor(Math.min(...values) - 2); const max = Math.ceil(Math.max(...values) + 2);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.innerHTML = ''; for (let tick = min; tick <= max; tick += 5) { const y = pad.top + (max - tick) / (max - min) * (height - pad.top - pad.bottom); svg.insertAdjacentHTML('beforeend', `<line class="chart-grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}"/><text class="chart-axis" x="${pad.left - 9}" y="${y + 4}" text-anchor="end">${tick}</text>`); }
    const dailyPath = data.days.map((d, index) => { const x = pad.left + index / 6 * (width - pad.left - pad.right); const y = pad.top + (max - d.maxDelta) / (max - min) * (height - pad.top - pad.bottom); return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join(' '); const hourlyPath = pathFor(data.days[state.day].frames, 'delta', width, height, pad, min, max);
    const cursorX = pad.left + state.day / 6 * (width - pad.left - pad.right); svg.insertAdjacentHTML('beforeend', `<path class="daily-line" d="${dailyPath}"/><path class="selected-line" d="${hourlyPath}"/><line class="day-cursor" x1="${cursorX}" x2="${cursorX}" y1="${pad.top}" y2="${height - pad.bottom}"/><text class="chart-label" x="${pad.left}" y="${height - 7}">14 SEP</text><text class="chart-label" x="${width / 2}" y="${height - 7}" text-anchor="middle">17 SEP</text><text class="chart-label" x="${width - pad.right}" y="${height - 7}" text-anchor="end">20 SEP</text>`);
  }
  function render() { renderDayStrip(); renderReadings(); renderMap(); renderChart(); }
  function setDay(index) { state.day = Number(index); state.hour = 12; render(); }
  function setZoom(next) { state.zoom = clamp(next, 1, 2.25); for (const id of ['map-world', 'cth-world']) $(id).style.transform = `scale(${state.zoom})`; $('zoom-in').disabled = state.zoom >= 2.25; $('zoom-out').disabled = state.zoom <= 1; }
  function stopPlayback() { clearInterval(timer); timer = null; state.playing = false; $('play-button').setAttribute('aria-label', '播放时间序列'); $('play-button').innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6Z"/></svg>'; }
  function togglePlayback() { if (state.playing) return stopPlayback(); state.playing = true; $('play-button').setAttribute('aria-label', '暂停时间序列'); $('play-button').innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4h3v12H5zm7 0h3v12h-3z"/></svg>'; timer = setInterval(() => { state.hour = state.hour >= 23 ? 0 : state.hour + 1; renderReadings(); renderChart(); }, 700); }
  document.addEventListener('click', (event) => { const day = event.target.closest('[data-day]'); if (day) return setDay(day.dataset.day); });
  $('time-slider').addEventListener('input', (event) => { stopPlayback(); state.hour = Number(event.target.value); renderReadings(); renderChart(); }); $('play-button').addEventListener('click', togglePlayback);
  $('cth-slider').addEventListener('input', (event) => selectCthFrame(event.target.value));
  $('cth-chart').addEventListener('click', (event) => { const svg = $('cth-chart'); const box = svg.getBoundingClientRect(); const width = svg.viewBox.baseVal.width; const px = (event.clientX - box.left) / box.width * width; const ratio = clamp((px - 45) / (width - 57), 0, 1); selectCthFrame(Math.round(ratio * (cthStats.length - 1))); });
  $('cth-chart').addEventListener('keydown', (event) => {
    let next = state.cthIndex;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next -= 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next += 1;
    else if (event.key === 'PageDown') next -= 3;
    else if (event.key === 'PageUp') next += 3;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = cthStats.length - 1;
    else return;
    event.preventDefault();
    selectCthFrame(next);
  });
  $('zoom-in').addEventListener('click', () => setZoom(state.zoom + .25)); $('zoom-out').addEventListener('click', () => setZoom(state.zoom - .25)); $('reset-map').addEventListener('click', () => setZoom(1)); $('map-frame').addEventListener('wheel', (event) => { event.preventDefault(); setZoom(state.zoom + (event.deltaY < 0 ? .1 : -.1)); }, { passive: false });
  $('about-button').addEventListener('click', () => $('data-dialog').showModal()); $('close-dialog').addEventListener('click', () => $('data-dialog').close()); $('map-image').addEventListener('error', () => $('map-error').hidden = false); $('cth-image').addEventListener('error', () => $('cth-map-error').hidden = false); window.addEventListener('resize', () => { fitMapToFrames(); renderChart(); renderCthChart(); }); document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); });
  fitMapToFrames(); setZoom(1); render();
})();
