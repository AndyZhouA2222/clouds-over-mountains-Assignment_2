'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const i18n = window.CLOUD_ATLAS_I18N;
  const data = window.CLOUD_ATLAS_DATA;
  const viewport = window.CLOUD_ATLAS_VIEWPORT;
  let cth = null;
  const effects = window.CLOUD_ATLAS_MOTION;
  const clamp = (n,low,high) => Math.max(low,Math.min(high,n));
  const valid = value => Number.isFinite(value);
  const number = (value, digits = 1) => valid(value) ? value.toFixed(digits) : '—';
  const time = value => String(value).padStart(2,'0') + ':00';
  const t = (key,values) => i18n.t(key,values);
  const state = {day:0,displayedDay:0,mapStatus:'loading',terrainStatus:'loading',hour:12,cloud:0,zoom:1,playing:false};
  let timer = null;
  let imageRequest = 0;
  let terrainRequest = 0;
  let sceneElements = [];
  let chartGeometry = null;
  let temperatureGeometry = null;
  let temperatureSize = {width:900,height:250};
  let cloudSize = {width:650,height:240};
  let temperatureFrame = 0;
  let cloudFrame = 0;
  let drawnCloud = -1;
  let hasClouds = false;
  let stats = [];
  let maxShare = .001;
  let cloudGrid = [];
  let cloudStatus = 'idle';
  let cloudScript = null;
  let currentChapter = null;
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
  const currentFrame = () => data.days[state.day].frames[state.hour];
  const temperatureValues = allFrames.map(frame => frame.delta).filter(valid);
  const temperatureDomain = temperatureValues.length ? {
    min:Math.floor((Math.min(...temperatureValues)-1)/5)*5,
    max:Math.ceil((Math.max(...temperatureValues)+1)/5)*5
  } : null;
  const masthead = document.querySelector('.masthead');
  const chapterSections = ['week','temperature','clouds'].map(id => ({id,element:$(id)}));
  const chapterLinks = [...document.querySelectorAll('.chapters a, .mobile-chapters a')];
  const weekStory = document.querySelector('.week-story');
  const stickyScene = document.querySelector('.sticky-scene');

  function renderCloudStatus() {
    const status = $('cloud-status');
    const retry = $('cloud-retry');
    const key = cloudStatus === 'loading' ? 'cloudLoading' : cloudStatus === 'error' ? 'cloudError' : 'cloudPending';
    status.textContent = t(key);
    $('cloud-feedback').dataset.state = cloudStatus;
    $('cloud-composition').setAttribute('aria-busy',String(cloudStatus === 'loading'));
    if (cloudStatus === 'ready' && document.activeElement === retry) status.focus({preventScroll:true});
    retry.hidden = cloudStatus !== 'error' && !(cloudStatus === 'loading' && !retry.hidden);
    retry.setAttribute('aria-disabled',String(cloudStatus === 'loading'));
    retry.textContent = t(cloudStatus === 'loading' ? 'retrying' : 'retryCloud');
    $('cth-slider').disabled = !hasClouds;
    $('cth-chart').setAttribute('aria-disabled',String(!hasClouds));
    $('cth-chart').setAttribute('tabindex',hasClouds ? '0' : '-1');
  }
  function prepareCloudData(value) {
    if (!value?.frames?.length || !value.latitudes?.length || !value.longitudes?.length) throw new Error('Missing cloud grid');
    const rows = value.latitudes.length;
    const columns = value.longitudes.length;
    if (!value.frames.every(frame => typeof frame.utc === 'string' && frame.values?.length === rows && frame.opacity?.length === rows
      && frame.values.every(row => row.length === columns) && frame.opacity.every(row => row.length === columns))) throw new Error('Incomplete cloud grid');
    cth = value;
    stats = cth.frames.map(frame => {
      const heights = frame.values.flatMap((row,r) => row.filter((height,c) => valid(height) && height > 0 && frame.opacity[r][c] > 0)).sort((a,b) => a-b);
      const quantile = p => heights.length ? heights[Math.floor((heights.length-1)*p)] : null;
      const bins = Array(10).fill(0);
      heights.forEach(height => bins[clamp(Math.floor(height/500),0,9)]++);
      return {count:heights.length,median:quantile(.5),p10:quantile(.1),p90:quantile(.9),bins};
    });
    maxShare = Math.max(.001,...stats.flatMap(stat => stat.bins.map(count => count/Math.max(1,stat.count))));
    const step = cth.gridDegrees || .03;
    const columnsProjected = cth.longitudes.map(lon => {
      const left = mercX(lon-step/2);
      return {x:(left-bbox[0])/(bbox[2]-bbox[0])*mapWidth,width:(mercX(lon+step/2)-left)/(bbox[2]-bbox[0])*mapWidth};
    });
    cloudGrid = cth.latitudes.map(lat => {
      const top = mercY(lat+step/2);
      const y = (bbox[3]-top)/(bbox[3]-bbox[1])*mapHeight;
      const height = (top-mercY(lat-step/2))/(bbox[3]-bbox[1])*mapHeight;
      return columnsProjected.map(column => ({...column,y,height}));
    });
    state.cloud = clamp(state.cloud,0,stats.length-1);
    drawnCloud = -1;
    chartGeometry = null;
    hasClouds = true;
  }
  function loadCloudData() {
    if (cloudStatus === 'loading' || cloudStatus === 'ready') return;
    const cached = cloudStatus === 'idle' ? window.CLOUD_ATLAS_CTH : null;
    cloudStatus = 'loading';
    renderCloudStatus();
    const failed = () => {
      cloudScript?.remove();
      cloudScript = null;
      hasClouds = false;
      cloudStatus = 'error';
      renderCloudStatus();
      viewport.request({resize:true});
    };
    const loaded = () => {
      try { prepareCloudData(window.CLOUD_ATLAS_CTH); }
      catch (_) { failed(); return; }
      cloudScript?.remove();
      cloudScript = null;
      cloudStatus = 'ready';
      renderCloudStatus();
      renderCloudReadings();
      renderCloudChart();
      drawClouds();
      viewport.request({resize:true});
      effects?.cloudsReady();
    };
    if (cached) { loaded(); return; }
    // A classic script keeps the downloaded site usable directly from file://.
    cloudScript = document.createElement('script');
    cloudScript.src = 'data/clouds.js';
    cloudScript.async = true;
    cloudScript.onload = loaded;
    cloudScript.onerror = failed;
    document.head.append(cloudScript);
  }

  function createScenes() {
    $('day-scenes').innerHTML = data.days.map((day,index) => '<article class="day-scene" data-scene="' + index + '"><p class="eyebrow scene-label"></p><h3>' + day.date.slice(8,10) + '<span class="scene-month"></span></h3><p class="day-reading">' + number(peaks[index]?.delta) + '°<small></small></p><p class="scene-story"></p></article>').join('');
    sceneElements = [...document.querySelectorAll('[data-scene]')];
    $('day-strip').innerHTML = '<span class="day-indicator" aria-hidden="true"></span>' + data.days.map((day,index) => '<button type="button" class="day-choice" data-day="' + index + '" aria-pressed="false"><span></span><strong>' + day.date.slice(8,10) + '</strong></button>').join('');
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
    $('day-strip').style.setProperty('--day-index',state.day);
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
    viewport.request();
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
      const previousSource = $('map-image').getAttribute('src');
      const previousDay = state.displayedDay;
      $('map-image').src = source;
      state.displayedDay = day;
      state.mapStatus = 'ready';
      updateMapText();
      if (previousSource !== source) effects?.sceneChanged(previousSource,Math.sign(day-previousDay));
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
    const {width,height} = temperatureSize;
    if (temperatureGeometry?.width === width && temperatureGeometry.height === height && temperatureGeometry.language === i18n.language) {
      updateTemperatureSelection();
      return;
    }
    const pad = {l:32,r:12,t:32,b:32};
    if (!temperatureDomain) { svg.innerHTML = ''; temperatureGeometry = null; return; }
    const {min,max} = temperatureDomain;
    const plotWidth = width-pad.l-pad.r;
    const plotHeight = height-pad.t-pad.b;
    // Every mark, including each daily maximum, shares the same hourly axis.
    const x = index => pad.l + (index+.5)/allFrames.length*plotWidth;
    const y = value => pad.t + (max-value)/(max-min)*plotHeight;
    let markup = '<rect class="chart-band" y="' + pad.t + '" height="' + plotHeight + '"/>';
    markup += '<text class="chart-axis chart-unit" x="' + pad.l + '" y="14">ΔT (°C)</text>';
    for (let tick=min;tick<=max;tick+=5) markup += '<line class="chart-grid" x1="' + pad.l + '" x2="' + (width-pad.r) + '" y1="' + y(tick) + '" y2="' + y(tick) + '"/><text class="chart-axis" x="' + (pad.l-9) + '" y="' + (y(tick)+3) + '" text-anchor="end">' + tick + '</text>';
    markup += '<path class="chart-line" d="' + pathFor(allFrames,x,y) + '"/><path class="chart-selected"/>';
    data.days.forEach((day,index) => {
      const peak = peaks[index];
      if (peak) markup += '<circle class="chart-peak" cx="' + x(offsets[index]+day.frames.indexOf(peak)) + '" cy="' + y(peak.delta) + '" r="2.6"/>';
      markup += '<text class="chart-axis" x="' + x(offsets[index]+(day.frames.length-1)/2) + '" y="' + (height-9) + '" text-anchor="middle">' + day.date.slice(8,10) + (width > 600 ? ' ' + t('month') : t('chartDay')) + '</text>';
    });
    markup += '<line class="chart-cursor" y1="' + pad.t + '" y2="' + (height-pad.b) + '"/><circle class="chart-point" r="4.5"/>';
    svg.setAttribute('viewBox','0 0 ' + width + ' ' + height);
    svg.innerHTML = markup;
    temperatureGeometry = {width,height,language:i18n.language,x,y,left:pad.l,plotWidth,day:-1,hour:-1,
      band:svg.querySelector('.chart-band'),selected:svg.querySelector('.chart-selected'),
      cursor:svg.querySelector('.chart-cursor'),point:svg.querySelector('.chart-point')};
    updateTemperatureSelection();
  }
  function updateTemperatureSelection() {
    const geometry = temperatureGeometry;
    if (!geometry || (geometry.day === state.day && geometry.hour === state.hour)) return;
    const start = offsets[state.day];
    if (geometry.day !== state.day) {
      geometry.band.setAttribute('x',geometry.left+start/allFrames.length*geometry.plotWidth);
      geometry.band.setAttribute('width',data.days[state.day].frames.length/allFrames.length*geometry.plotWidth);
      geometry.selected.setAttribute('d',pathFor(data.days[state.day].frames,geometry.x,geometry.y,start));
    }
    const x = geometry.x(start+state.hour);
    geometry.cursor.setAttribute('x1',x);
    geometry.cursor.setAttribute('x2',x);
    const delta = currentFrame()?.delta;
    geometry.point.setAttribute('visibility',valid(delta) ? 'visible' : 'hidden');
    if (valid(delta)) {
      geometry.point.setAttribute('cx',x);
      geometry.point.setAttribute('cy',geometry.y(delta));
    }
    geometry.day = state.day;
    geometry.hour = state.hour;
  }
  function requestTemperatureSelection() {
    if (temperatureFrame) return;
    temperatureFrame = requestAnimationFrame(() => {
      temperatureFrame = 0;
      updateTemperatureSelection();
    });
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
    effects?.dayChanged();
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
      effects?.playTick();
    },850);
  }
  function drawClouds() {
    const ctx = $('cloud-canvas').getContext('2d');
    if (!ctx || !hasClouds || drawnCloud === state.cloud) return;
    ctx.clearRect(0,0,mapWidth,mapHeight);
    const frame = cth.frames[state.cloud];
    cloudGrid.forEach((cells,row) => cells.forEach((cell,col) => {
      const height = frame.values[row][col];
      const opacity = frame.opacity[row][col];
      if (!valid(height) || height <= 0 || !valid(opacity) || opacity <= 0) return;
      ctx.fillStyle = 'rgba(' + colorFor(height) + ',' + (.22+.42*clamp(opacity,0,100)/100) + ')';
      ctx.fillRect(cell.x,cell.y,cell.width,cell.height);
    }));
    drawnCloud = state.cloud;
  }
  function requestCloudDraw() {
    if (cloudFrame) return;
    cloudFrame = requestAnimationFrame(() => {
      cloudFrame = 0;
      drawClouds();
    });
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
    const {width,height} = cloudSize;
    if (chartGeometry?.width === width && chartGeometry.height === height) {
      updateCloudSelection();
      return;
    }
    effects?.resetCloudMotion();
    const pad = {l:38,r:8,t:8,b:28};
    const cellWidth = (width-pad.l-pad.r)/stats.length;
    const cellHeight = (height-pad.t-pad.b)/10;
    const x = index => pad.l+(index+.5)*cellWidth;
    const y = bin => pad.t+(9-bin+.5)*cellHeight;
    let markup = '';
    stats.forEach((item,index) => item.bins.forEach((count,bin) => {
      const share = count/Math.max(1,item.count);
      const alpha = count ? .1+.85*Math.sqrt(share/maxShare) : .025;
      markup += '<rect class="cth-cell" data-col="' + index + '" x="' + (pad.l+index*cellWidth+1) + '" y="' + (pad.t+(9-bin)*cellHeight+.5) + '" width="' + (cellWidth-2) + '" height="' + (cellHeight-1) + '" fill="rgb(' + colorFor(bin*500+250) + ')" fill-opacity="' + alpha + '"/>';
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
    markup += '<path class="cth-line" d="' + line + '"/><rect class="cth-cursor" y="' + pad.t + '" width="' + (cellWidth-1) + '" height="' + (cellHeight*10) + '"/><circle class="cth-point" r="4"/>';
    stats.forEach((_,index) => {
      if (index%3 === 0 || index === stats.length-1) markup += '<text class="chart-axis" x="' + x(index) + '" y="' + (height-7) + '" text-anchor="middle">' + cth.frames[index].utc.slice(11,13) + '</text>';
    });
    svg.setAttribute('viewBox','0 0 ' + width + ' ' + height);
    svg.innerHTML = markup;
    chartGeometry = {width,height,left:pad.l,cellWidth,x,y,cloud:-1,
      cursor:svg.querySelector('.cth-cursor'),point:svg.querySelector('.cth-point')};
    updateCloudSelection();
  }
  function updateCloudSelection() {
    const geometry = chartGeometry;
    if (!geometry || geometry.cloud === state.cloud) return;
    geometry.cursor.setAttribute('x',geometry.left+state.cloud*geometry.cellWidth+.5);
    const median = stats[state.cloud].median;
    geometry.point.setAttribute('visibility',valid(median) ? 'visible' : 'hidden');
    if (valid(median)) {
      geometry.point.setAttribute('cx',geometry.x(state.cloud));
      geometry.point.setAttribute('cy',geometry.y(clamp(Math.floor(median/500),0,9)));
    }
    geometry.cloud = state.cloud;
  }
  function selectCloud(index,stepped = false) {
    if (!hasClouds) return false;
    const next = clamp(index,0,stats.length-1);
    if (next === state.cloud) return false;
    effects?.resetCloudMotion();
    // Discrete steps (a column, a key) pass between scans; slider dragging stays immediate.
    if (stepped) effects?.cloudFrameWillChange(Math.sign(next-state.cloud));
    state.cloud = next;
    renderCloudReadings(); updateCloudSelection(); requestCloudDraw();
    return true;
  }
  function renderLanguage() {
    translateScenes(); updateMapText(); renderTerrainStatus(); renderReadings(); renderWeeklyFinding(); updatePlayButton(); renderTemperatureChart(); renderCloudReadings(); renderCloudChart();
    renderCloudStatus();
    viewport.request({resize:true});
  }
  function measurePage(frame) {
    const threshold = frame.rect(masthead).bottom + 32;
    let current = '';
    let loadClouds = false;
    chapterSections.forEach(({id,element}) => {
      const rect = frame.rect(element);
      if (rect.top <= threshold && rect.bottom > threshold) current = '#' + id;
      if (id === 'clouds') loadClouds = cloudStatus === 'idle' && rect.top < frame.height+800 && rect.bottom > 0;
    });
    const storyRect = frame.rect(weekStory);
    let nearest = null;
    if (storyRect.top < frame.height && storyRect.bottom > 0) {
      const readingTop = clamp(frame.rect(stickyScene).bottom,0,frame.height);
      const target = frame.width <= 800 ? Math.min(frame.height-24,readingTop+(frame.height-readingTop)*.45) : frame.height*.5;
      if (storyRect.top < target && storyRect.bottom > target) {
        let distance = Infinity;
        sceneElements.forEach((scene,index) => {
          const rect = frame.rect(scene);
          const delta = Math.abs(rect.top+rect.height/2-target);
          if (delta < distance) { distance = delta; nearest = index; }
        });
      }
    }
    let sizes = null;
    if (frame.resized) {
      const temperature = frame.rect($('analysis-chart'));
      const cloud = frame.rect($('cth-chart'));
      sizes = {temperature:{width:Math.max(280,temperature.width || 900),height:temperature.height || 250},
        cloud:{width:Math.max(280,cloud.width || 650),height:cloud.height || 240}};
    }
    return {current,nearest,loadClouds,sizes};
  }
  function updatePage(value) {
    if (currentChapter !== value.current) {
      currentChapter = value.current;
      chapterLinks.forEach(link => {
        if (link.getAttribute('href') === value.current) link.setAttribute('aria-current','location');
        else link.removeAttribute('aria-current');
      });
    }
    if (value.sizes) {
      temperatureSize = value.sizes.temperature;
      cloudSize = value.sizes.cloud;
      renderTemperatureChart(); renderCloudChart();
    }
    if (value.nearest !== null && value.nearest !== state.day) { stopPlayback(); selectDay(value.nearest); }
    if (value.loadClouds) loadCloudData();
  }
  $('time-slider').addEventListener('input',event => {
    stopPlayback();
    const hour = Number(event.target.value);
    if (hour === state.hour) return;
    state.hour = hour;
    renderReadings(); requestTemperatureSelection();
  });
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
    if (selectCloud(Math.floor((px-chartGeometry.left)/chartGeometry.cellWidth),true)) effects?.cloudChanged(previousX);
  });
  $('cth-chart').addEventListener('keydown',event => {
    const moves = {ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1,PageDown:-3,PageUp:3};
    let next;
    if (event.key in moves) next = state.cloud+moves[event.key];
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = stats.length-1;
    else return;
    event.preventDefault(); selectCloud(next,true);
  });
  $('map-retry').addEventListener('click',() => { if (state.mapStatus === 'error') loadMap(); });
  $('terrain-retry').addEventListener('click',loadTerrain);
  $('cloud-retry').addEventListener('click',loadCloudData);
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
  createScenes(); renderMarkers(); setZoom(1); renderLanguage(); loadMap();
  viewport.subscribe({measure:measurePage,update:updatePage});
  effects?.init();
})();
