'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const i18n = window.CLOUD_ATLAS_I18N;
  const data = window.CLOUD_ATLAS_DATA;
  const cth = window.CLOUD_ATLAS_CTH;
  const effects = window.CLOUD_ATLAS_MOTION;
  const clamp = (n,low,high) => Math.max(low,Math.min(high,n));
  const valid = value => Number.isFinite(value);
  const number = (value, digits = 1) => valid(value) ? value.toFixed(digits) : '—';
  const time = value => String(value).padStart(2,'0') + ':00';
  const t = (key,values) => i18n.t(key,values);
  const state = {day:0,displayedDay:0,mapStatus:'loading',terrainStatus:'loading',hour:12,cloud:0,zoom:1,playing:false};
  let timer = null;
  let scrollPending = false;
  let imageRequest = 0;
  let terrainRequest = 0;
  let sceneElements = [];
  let chartGeometry = null;
  i18n.init();
  // A first visit starts in English; returning visitors retain their choice.
  let savedLanguage = 'en';
  try { savedLanguage = localStorage.getItem('cloud-atlas-language') || 'en'; } catch (_) { /* Storage may be unavailable for local files. */ }
  i18n.set(savedLanguage);

  const dialog = $('data-dialog');
  $('about-button').addEventListener('click', () => { stopPlayback(); dialog.showModal(); effects?.dialogOpened(dialog); });
  function closeSources() {
    if (effects) effects.closeDialog(dialog);
    else dialog.close();
  }
  $('close-dialog').addEventListener('click',closeSources);
  dialog.addEventListener('cancel',event => { event.preventDefault(); closeSources(); });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeSources();
  });
  document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => {
    i18n.set(button.dataset.lang);
    try { localStorage.setItem('cloud-atlas-language',i18n.language); } catch (_) { /* The toggle still works without storage. */ }
    if (data?.days?.length) renderLanguage();
    else showError('dataError');
  }));

  function showError(key) { $('data-error').hidden = false; $('data-error').textContent = t(key); }
  if (!data?.days?.length || !data.map || !data.stations) {
    showError('dataError');
    document.querySelectorAll('input, .map-controls button, #play-button').forEach(control => control.disabled = true);
    return;
  }
  const allFrames = data.days.flatMap(day => day.frames);
  const offsets = data.days.map((_, index) => data.days.slice(0,index).reduce((sum,day) => sum + day.frames.length,0));
  const peaks = data.days.map(day => day.frames.reduce((peak, frame) => valid(frame.delta) && (!peak || frame.delta > peak.delta) ? frame : peak,null));
  const bbox = data.map.bbox;
  const mapWidth = data.map.width;
  const mapHeight = data.map.height;
  const mercX = lon => lon * 20037508.34 / 180;
  const mercY = lat => Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180;
  const project = (lon,lat) => ({x:(mercX(lon)-bbox[0])/(bbox[2]-bbox[0])*mapWidth,y:(bbox[3]-mercY(lat))/(bbox[3]-bbox[1])*mapHeight});
  const colors = ['72,128,173','51,184,181','125,216,154','239,198,91','243,132,94'];
  const colorFor = height => colors[height < 1500 ? 0 : height < 2500 ? 1 : height < 3500 ? 2 : height < 4500 ? 3 : 4];
  const hasClouds = Boolean(cth?.frames?.length && cth.latitudes?.length && cth.longitudes?.length);
  const stats = hasClouds ? cth.frames.map(frame => {
    const heights = frame.values.flatMap((row,r) => row.filter((height,c) => valid(height) && height > 0 && frame.opacity[r][c] > 0)).sort((a,b) => a-b);
    const quantile = p => heights.length ? heights[Math.floor((heights.length-1)*p)] : null;
    const bins = Array(10).fill(0);
    heights.forEach(height => bins[clamp(Math.floor(height/500),0,9)]++);
    return {count:heights.length,median:quantile(.5),p10:quantile(.1),p90:quantile(.9),bins};
  }) : [];
  const maxShare = Math.max(.001,...stats.flatMap(stat => stat.bins.map(count => count / Math.max(1,stat.count))));
  const currentFrame = () => data.days[state.day].frames[state.hour];

  function createScenes() {
    $('day-scenes').innerHTML = data.days.map((day,index) => '<article class="day-scene" data-scene="' + index + '"><p class="eyebrow scene-label"></p><h3>' + day.date.slice(8,10) + '<span class="scene-month"></span></h3><p class="day-reading">' + number(peaks[index]?.delta) + '°<small></small></p><p class="scene-story"></p></article>').join('');
    sceneElements = [...document.querySelectorAll('[data-scene]')];
    $('day-strip').innerHTML = data.days.map((day,index) => '<button type="button" class="day-choice" data-day="' + index + '" aria-pressed="false"><span></span><strong>' + day.date.slice(8,10) + '</strong></button>').join('');
    document.querySelectorAll('[data-day]').forEach(button => button.addEventListener('click', () => {
      stopPlayback();
      selectDay(Number(button.dataset.day));
      effects?.readingChanged();
    }));
  }
  function translateScenes() {
    sceneElements.forEach((scene,index) => {
      scene.querySelector('.scene-label').textContent = t('dayCount',{n:String(index+1).padStart(2,'0')});
      scene.querySelector('.scene-month').textContent = t('month');
      scene.querySelector('.day-reading small').textContent = t('dailyPeak');
      scene.querySelector('.scene-story').textContent = peaks[index] ? t('peakStory',{time:time(peaks[index].hour)}) : t('unavailable');
    });
    document.querySelectorAll('[data-day]').forEach(button => {
      button.querySelector('span').textContent = t('month');
      button.setAttribute('aria-label',t('dayAria',{date:i18n.date(data.days[Number(button.dataset.day)].date,true)}));
    });
  }
  function renderMarkers() {
    // Both layers use the same projected coordinates and the full image aspect ratio.
    const html = data.stations.map(station => {
      const position = project(station.lon,station.lat);
      const summit = station.id === '05792';
      return '<span class="map-marker ' + (summit?'summit':'valley') + '" style="left:' + position.x/mapWidth*100 + '%;top:' + position.y/mapHeight*100 + '%"><b>' + (summit?'Zugspitze':'Garmisch') + '</b></span>';
    }).join('');
    $('map-markers').innerHTML = html;
    $('cth-markers').innerHTML = html;
  }
  function renderMapReadings() {
    // Use the displayed image's day, so a pending request cannot mix dates.
    const peak = peaks[state.displayedDay];
    $('map-valley-temperature').textContent = number(peak?.valley);
    $('map-summit-temperature').textContent = number(peak?.summit);
    $('map-peak-delta').textContent = number(peak?.delta);
    $('map-ground-time').textContent = peak ? t('mapGroundTime',{time:time(peak.hour)}) : t('unavailable');
    $('map-ground-summary').textContent = peak ? t('mapGroundSummary',{
      date:i18n.date(data.days[state.displayedDay].date,true),time:time(peak.hour),
      valley:number(peak.valley),summit:number(peak.summit),delta:number(peak.delta)
    }) : t('unavailable');
  }
  function updateMapText() {
    // The image caption always describes the image that has actually arrived.
    const day = data.days[state.displayedDay];
    $('map-date').textContent = i18n.date(day.date,true);
    $('scene-counter').textContent = String(state.displayedDay+1).padStart(2,'0') + ' / ' + String(data.days.length).padStart(2,'0');
    $('map-image').alt = t('imageAlt',{date:i18n.date(day.date,true)});
    $('scene-progress').style.width = ((state.displayedDay+1)/data.days.length*100) + '%';
    sceneElements.forEach((scene,index) => scene.classList.toggle('is-current',index === state.day));
    document.querySelectorAll('[data-day]').forEach(button => button.setAttribute('aria-pressed',String(Number(button.dataset.day) === state.day)));
    renderMapReadings();
    renderMapStatus();
  }
  function renderImageFeedback(prefix,status,message) {
    const retry = $(prefix + '-retry');
    const feedback = $(prefix + '-status');
    feedback.textContent = message;
    $(prefix + '-feedback').dataset.state = status;
    $(prefix === 'map' ? 'viirs-panel' : 'cth-world').setAttribute('aria-busy',String(status === 'loading'));
    // Keep a focused retry in place while loading; restore focus before hiding it.
    if (status === 'ready' && document.activeElement === retry) feedback.focus({preventScroll:true});
    retry.hidden = status !== 'error' && !(status === 'loading' && !retry.hidden);
    retry.setAttribute('aria-disabled',String(status === 'loading'));
    retry.textContent = t(status === 'loading' ? 'retrying' : prefix === 'map' ? 'retryImage' : 'retryTerrain');
  }
  function renderMapStatus() {
    const key = state.mapStatus === 'loading' ? 'imageLoading' : state.mapStatus === 'error' ? 'imageLoadError' : 'imageReady';
    const day = state.mapStatus === 'ready' ? state.displayedDay : state.day;
    renderImageFeedback('map',state.mapStatus,t(key,{date:i18n.date(data.days[day].date,true)}));
  }
  function renderTerrainStatus() {
    const key = state.terrainStatus === 'loading' ? 'terrainLoading' : state.terrainStatus === 'error' ? 'terrainError' : 'terrainReady';
    renderImageFeedback('terrain',state.terrainStatus,t(key));
  }
  function loadMap() {
    const day = state.day;
    const source = data.days[day].image;
    const request = ++imageRequest;
    state.mapStatus = 'loading';
    renderMapStatus();
    // Load the incoming scene before replacing the current image to avoid a flash.
    const pending = new Image();
    pending.onload = async () => {
      try {
        if (pending.decode) await pending.decode();
      } catch (_) {
        pending.onerror();
        return;
      }
      if (request !== imageRequest) return;
      const changed = $('map-image').getAttribute('src') !== source;
      $('map-image').src = source;
      state.displayedDay = day;
      state.mapStatus = 'ready';
      updateMapText();
      if (changed) effects?.sceneChanged();
    };
    pending.onerror = () => {
      if (request !== imageRequest) return;
      state.mapStatus = 'error';
      renderMapStatus();
    };
    pending.src = source;
  }
  function loadTerrain() {
    if (state.terrainStatus === 'loading') return;
    const request = ++terrainRequest;
    state.terrainStatus = 'loading';
    renderTerrainStatus();
    const pending = new Image();
    pending.onload = () => {
      if (request !== terrainRequest) return;
      $('cth-image').src = data.map.terrain;
      state.terrainStatus = 'ready';
      renderTerrainStatus();
    };
    pending.onerror = () => {
      if (request !== terrainRequest) return;
      state.terrainStatus = 'error';
      renderTerrainStatus();
    };
    pending.src = data.map.terrain;
  }
  function renderReadings() {
    const frame = currentFrame();
    const day = data.days[state.day];
    const peak = peaks[state.day];
    $('valley-now').textContent = number(frame?.valley);
    $('summit-now').textContent = number(frame?.summit);
    $('live-delta').textContent = number(frame?.delta);
    $('reading-stamp').textContent = i18n.date(day.date) + ' / ' + time(frame?.hour ?? state.hour) + ' UTC';
    $('selected-time').textContent = time(frame?.hour ?? state.hour) + ' UTC';
    $('peak-note').textContent = peak ? t('peakNote',{value:number(peak.delta),time:time(peak.hour)}) : t('unavailable');
    $('time-slider').max = day.frames.length - 1;
    $('time-slider').value = state.hour;
    $('time-slider').style.setProperty('--range',(state.hour / Math.max(1,day.frames.length-1)*100) + '%');
    $('time-slider').setAttribute('aria-valuetext',t('selectedHour',{date:i18n.date(day.date),time:time(frame?.hour ?? state.hour),value:number(frame?.delta)}));
  }
  function renderWeeklyFinding() {
    const values = allFrames.map(frame => frame.delta).filter(valid);
    const dailyPeaks = peaks.filter(Boolean).map(frame => frame.delta);
    if (!values.length || !dailyPeaks.length) {
      $('week-finding').textContent = t('unavailable');
      return;
    }
    const min = Math.min(...values);
    $('week-finding').textContent = t(min > 0 ? 'weekFindingPositive' : 'weekFindingRange', {
      count:values.length,
      min:number(min), max:number(Math.max(...values)),
      peakMin:number(Math.min(...dailyPeaks)), peakMax:number(Math.max(...dailyPeaks))
    });
  }
  function pathFor(frames,x,y,offset = 0) {
    let connected = false;
    return frames.map((frame,index) => {
      if (!valid(frame.delta)) { connected = false; return ''; }
      const command = (connected?'L':'M') + x(index+offset).toFixed(2) + ',' + y(frame.delta).toFixed(2);
      connected = true;
      return command;
    }).join(' ');
  }
  function renderTemperatureChart() {
    const svg = $('analysis-chart');
    const width = Math.max(280,svg.clientWidth || 900);
    const height = svg.clientHeight || 250;
    const pad = {l:32,r:12,t:32,b:32};
    const values = allFrames.map(frame => frame.delta).filter(valid);
    if (!values.length) { svg.innerHTML = ''; return; }
    const min = Math.floor((Math.min(...values)-1)/5)*5;
    const max = Math.ceil((Math.max(...values)+1)/5)*5;
    const plotWidth = width-pad.l-pad.r;
    const plotHeight = height-pad.t-pad.b;
    // Every mark, including each daily maximum, shares the same hourly axis.
    const x = index => pad.l + (index+.5)/allFrames.length*plotWidth;
    const y = value => pad.t + (max-value)/(max-min)*plotHeight;
    const start = offsets[state.day];
    const selectedX = x(start+state.hour);
    let markup = '<rect class="chart-band" x="' + (pad.l+start/allFrames.length*plotWidth) + '" y="' + pad.t + '" width="' + (data.days[state.day].frames.length/allFrames.length*plotWidth) + '" height="' + plotHeight + '"/>';
    markup += '<text class="chart-axis chart-unit" x="' + pad.l + '" y="14">ΔT (°C)</text>';
    for (let tick=min;tick<=max;tick+=5) markup += '<line class="chart-grid" x1="' + pad.l + '" x2="' + (width-pad.r) + '" y1="' + y(tick) + '" y2="' + y(tick) + '"/><text class="chart-axis" x="' + (pad.l-9) + '" y="' + (y(tick)+3) + '" text-anchor="end">' + tick + '</text>';
    markup += '<path class="chart-line" d="' + pathFor(allFrames,x,y) + '"/><path class="chart-selected" d="' + pathFor(data.days[state.day].frames,x,y,start) + '"/>';
    data.days.forEach((day,index) => {
      const peak = peaks[index];
      if (peak) markup += '<circle class="chart-peak" cx="' + x(offsets[index]+day.frames.indexOf(peak)) + '" cy="' + y(peak.delta) + '" r="2.6"/>';
      markup += '<text class="chart-axis" x="' + x(offsets[index]+(day.frames.length-1)/2) + '" y="' + (height-9) + '" text-anchor="middle">' + day.date.slice(8,10) + (width > 600 ? ' ' + t('month') : t('chartDay')) + '</text>';
    });
    markup += '<line class="chart-cursor" x1="' + selectedX + '" x2="' + selectedX + '" y1="' + pad.t + '" y2="' + (height-pad.b) + '"/>';
    if (valid(currentFrame()?.delta)) markup += '<circle class="chart-point" cx="' + selectedX + '" cy="' + y(currentFrame().delta) + '" r="4.5"/>';
    svg.setAttribute('viewBox','0 0 ' + width + ' ' + height);
    svg.innerHTML = markup;
  }
  function selectDay(index) {
    const next = clamp(index,0,data.days.length-1);
    if (next === state.day) {
      if (state.mapStatus === 'error') loadMap();
      return;
    }
    state.day = next;
    state.hour = clamp(state.hour,0,data.days[next].frames.length-1);
    loadMap(); updateMapText(); renderReadings(); renderTemperatureChart();
  }
  function setZoom(next) {
    state.zoom = clamp(next,1,2.25);
    $('map-world').style.transform = 'scale(' + state.zoom + ')';
    $('zoom-in').disabled = state.zoom >= 2.25;
    $('zoom-out').disabled = state.zoom <= 1;
    $('reset-map').disabled = state.zoom === 1;
  }
  function updatePlayButton() {
    $('play-button').setAttribute('aria-pressed',String(state.playing));
    $('play-button').setAttribute('aria-label',t(state.playing?'pause':'play'));
  }
  function stopPlayback() {
    clearInterval(timer);
    timer = null;
    state.playing = false;
    updatePlayButton();
  }
  function togglePlayback() {
    if (state.playing) return stopPlayback();
    state.playing = true;
    updatePlayButton();
    timer = setInterval(() => {
      state.hour = (state.hour+1)%data.days[state.day].frames.length;
      renderReadings(); renderTemperatureChart();
    },850);
  }
  function drawClouds() {
    const ctx = $('cloud-canvas').getContext('2d');
    if (!ctx || !hasClouds) return;
    ctx.clearRect(0,0,mapWidth,mapHeight);
    const frame = cth.frames[state.cloud];
    const step = cth.gridDegrees || .03;
    cth.latitudes.forEach((lat,row) => cth.longitudes.forEach((lon,col) => {
      const height = frame.values[row][col];
      const opacity = frame.opacity[row][col];
      if (!valid(height) || height <= 0 || !valid(opacity) || opacity <= 0) return;
      const nw = project(lon-step/2,lat+step/2);
      const se = project(lon+step/2,lat-step/2);
      ctx.fillStyle = 'rgba(' + colorFor(height) + ',' + (.22+.42*clamp(opacity,0,100)/100) + ')';
      ctx.fillRect(nw.x,nw.y,se.x-nw.x,se.y-nw.y);
    }));
  }
  function renderCloudReadings() {
    if (!hasClouds) return;
    const item = stats[state.cloud];
    const stamp = cth.frames[state.cloud].utc.slice(11,16);
    const median = valid(item.median) ? number(item.median/1000,2) : '—';
    $('cth-median').textContent = median;
    $('cth-range').textContent = valid(item.p10) && valid(item.p90) ? number(item.p10/1000) + '–' + number(item.p90/1000) + ' km' : t('unavailable');
    $('cth-valid').textContent = item.count.toLocaleString(i18n.language === 'zh'?'zh-CN':'en-GB') + ' / ' + (cth.latitudes.length*cth.longitudes.length).toLocaleString('en-GB');
    $('cth-observed').textContent = stamp + ' UTC';
    $('cth-map-time').textContent = stamp + ' UTC';
    $('cth-slider-time').textContent = stamp + ' UTC';
    $('cth-frame-count').textContent = String(state.cloud+1).padStart(2,'0') + ' / ' + stats.length;
    $('cth-slider').max = stats.length-1;
    $('cth-slider').value = state.cloud;
    $('cth-slider').style.setProperty('--range',(state.cloud/Math.max(1,stats.length-1)*100) + '%');
    const description = t('cloudValue',{time:stamp,value:median});
    $('cth-slider').setAttribute('aria-valuetext',description);
    $('cth-chart').setAttribute('aria-valuemax',String(stats.length-1));
    $('cth-chart').setAttribute('aria-valuenow',String(state.cloud));
    $('cth-chart').setAttribute('aria-valuetext',description);
  }
  function renderCloudChart() {
    if (!hasClouds) return;
    const svg = $('cth-chart');
    const width = Math.max(280,svg.clientWidth || 650);
    const height = svg.clientHeight || 240;
    const pad = {l:38,r:8,t:8,b:28};
    const cellWidth = (width-pad.l-pad.r)/stats.length;
    const cellHeight = (height-pad.t-pad.b)/10;
    const x = index => pad.l+(index+.5)*cellWidth;
    const y = bin => pad.t+(9-bin+.5)*cellHeight;
    let markup = '';
    stats.forEach((item,index) => item.bins.forEach((count,bin) => {
      const share = count/Math.max(1,item.count);
      const alpha = count ? .1+.85*Math.sqrt(share/maxShare) : .025;
      markup += '<rect x="' + (pad.l+index*cellWidth+1) + '" y="' + (pad.t+(9-bin)*cellHeight+.5) + '" width="' + (cellWidth-2) + '" height="' + (cellHeight-1) + '" fill="rgb(' + colorFor(bin*500+250) + ')" fill-opacity="' + alpha + '"/>';
    }));
    [0,2,4,6,8,9].forEach(bin => {
      markup += '<text class="chart-axis" x="' + (pad.l-8) + '" y="' + (y(bin)+3) + '" text-anchor="end">' + (bin === 9 ? '4.5+' : (bin/2).toFixed(1)) + '</text>';
    });
    let connected = false;
    const line = stats.map((item,index) => {
      if (!valid(item.median)) { connected = false; return ''; }
      const command = (connected?'L':'M') + x(index) + ',' + y(clamp(Math.floor(item.median/500),0,9));
      connected = true;
      return command;
    }).join(' ');
    markup += '<path class="cth-line" d="' + line + '"/><rect class="cth-cursor" x="' + (pad.l+state.cloud*cellWidth+.5) + '" y="' + pad.t + '" width="' + (cellWidth-1) + '" height="' + (cellHeight*10) + '"/>';
    if (valid(stats[state.cloud].median)) markup += '<circle class="cth-point" cx="' + x(state.cloud) + '" cy="' + y(clamp(Math.floor(stats[state.cloud].median/500),0,9)) + '" r="4"/>';
    stats.forEach((_,index) => {
      if (index%3 === 0 || index === stats.length-1) markup += '<text class="chart-axis" x="' + x(index) + '" y="' + (height-7) + '" text-anchor="middle">' + cth.frames[index].utc.slice(11,13) + '</text>';
    });
    svg.setAttribute('viewBox','0 0 ' + width + ' ' + height);
    svg.innerHTML = markup;
    chartGeometry = {width,left:pad.l,cellWidth};
  }
  function selectCloud(index) {
    if (!hasClouds) return;
    state.cloud = clamp(index,0,stats.length-1);
    drawClouds(); renderCloudReadings(); renderCloudChart();
  }
  function renderLanguage() {
    translateScenes(); updateMapText(); renderTerrainStatus(); renderReadings(); renderWeeklyFinding(); updatePlayButton(); renderTemperatureChart(); renderCloudReadings(); renderCloudChart();
    if (!hasClouds) showError('cloudError');
  }
  function updateChapterNavigation() {
    const threshold = document.querySelector('.masthead').getBoundingClientRect().bottom + 32;
    let current = '';
    for (const id of ['week','temperature','clouds']) {
      const rect = $(id).getBoundingClientRect();
      if (rect.top <= threshold && rect.bottom > threshold) current = '#' + id;
    }
    document.querySelectorAll('.chapters a, .mobile-chapters a').forEach(link => {
      if (link.getAttribute('href') === current) link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
  }
  function syncScroll() {
    scrollPending = false;
    updateChapterNavigation();
    const storyRect = document.querySelector('.week-story').getBoundingClientRect();
    const mobile = window.innerWidth <= 800;
    const sticky = document.querySelector('.sticky-scene');
    // Read the scene beneath the sticky map, including the mobile chapter header.
    const readingTop = clamp(sticky.getBoundingClientRect().bottom,0,innerHeight);
    const target = mobile ? Math.min(innerHeight-24,readingTop+(innerHeight-readingTop)*.45) : innerHeight*.5;
    if (storyRect.top < target && storyRect.bottom > target) {
      let nearest = 0;
      let distance = Infinity;
      sceneElements.forEach((scene,index) => {
        const rect = scene.getBoundingClientRect();
        const delta = Math.abs(rect.top+rect.height/2-target);
        if (delta < distance) { distance = delta; nearest = index; }
      });
      if (nearest !== state.day) { stopPlayback(); selectDay(nearest); }
    }
  }
  $('time-slider').addEventListener('input',event => { stopPlayback(); state.hour = Number(event.target.value); renderReadings(); renderTemperatureChart(); });
  $('time-slider').addEventListener('change',() => effects?.readingChanged());
  $('play-button').addEventListener('click',togglePlayback);
  $('zoom-in').addEventListener('click',() => setZoom(state.zoom+.25));
  $('zoom-out').addEventListener('click',() => setZoom(state.zoom-.25));
  $('reset-map').addEventListener('click',() => setZoom(1));
  // Normal wheel and touch scrolling always belong to the document.
  $('cth-slider').addEventListener('input',event => selectCloud(Number(event.target.value)));
  $('cth-slider').addEventListener('change',() => effects?.cloudChanged());
  $('cth-chart').addEventListener('click',event => {
    if (!chartGeometry) return;
    const previousX = Number($('cth-chart').querySelector('.cth-cursor')?.getAttribute('x'));
    const rect = $('cth-chart').getBoundingClientRect();
    const px = (event.clientX-rect.left)/rect.width*chartGeometry.width;
    selectCloud(Math.floor((px-chartGeometry.left)/chartGeometry.cellWidth));
    effects?.cloudChanged(previousX);
  });
  $('cth-chart').addEventListener('keydown',event => {
    const moves = {ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1,PageDown:-3,PageUp:3};
    let next;
    if (event.key in moves) next = state.cloud+moves[event.key];
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = stats.length-1;
    else return;
    event.preventDefault(); selectCloud(next);
  });
  $('map-retry').addEventListener('click',() => { if (state.mapStatus === 'error') loadMap(); });
  $('terrain-retry').addEventListener('click',loadTerrain);
  $('map-image').addEventListener('error',() => {
    if (state.mapStatus !== 'ready') return;
    state.mapStatus = 'error';
    renderMapStatus();
  });
  // The initial terrain image stays lazy; explicit retries own their load state.
  for (const event of ['load','error']) {
    $('cth-image').addEventListener(event,() => {
      if (terrainRequest) return;
      state.terrainStatus = event === 'load' ? 'ready' : 'error';
      renderTerrainStatus();
    });
  }
  if ($('cth-image').complete) state.terrainStatus = $('cth-image').naturalWidth ? 'ready' : 'error';
  document.addEventListener('visibilitychange',() => { if (document.hidden) stopPlayback(); });
  window.addEventListener('pagehide',stopPlayback);
  window.addEventListener('scroll',() => { if (!scrollPending) { scrollPending = true; requestAnimationFrame(syncScroll); } },{passive:true});
  let resizePending = false;
  window.addEventListener('resize',() => {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => { resizePending = false; renderTemperatureChart(); renderCloudChart(); syncScroll(); });
  },{passive:true});
  createScenes(); renderMarkers(); setZoom(1); renderLanguage(); loadMap();
  if (hasClouds) drawClouds();
  else {
    $('cth-slider').disabled = true;
    $('cth-chart').setAttribute('aria-disabled','true');
    $('cth-chart').removeAttribute('tabindex');
  }
  requestAnimationFrame(syncScroll);
  effects?.init();
})();
