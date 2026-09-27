'use strict';
window.CLOUD_ATLAS_MOTION = (() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.2,.7,.2,1)';
  // Arrivals decelerate hard (expo-out); a sweep that follows a subject eases in and out.
  const snap = 'cubic-bezier(.16,1,.3,1)';
  const sweep = 'cubic-bezier(.45,0,.2,1)';
  // Damped-spring step responses, sampled once: ζ < 1 overshoots a little and settles.
  const springs = {
    soft:{zeta:.82,omega:18},
    snappy:{zeta:.62,omega:28},
    pop:{zeta:.45,omega:30},
    rise:{zeta:.78,omega:12}
  };
  function springResponse(tau,zeta,omega) {
    if (tau <= 0) return 0;
    const damped = omega*Math.sqrt(1-zeta*zeta);
    return 1-Math.exp(-zeta*omega*tau)*(Math.cos(damped*tau)+zeta*omega/damped*Math.sin(damped*tau));
  }
  Object.values(springs).forEach(spring => {
    let settle = 0;
    for (let ms = 1; ms < 3000; ms++) if (Math.abs(1-springResponse(ms/1000,spring.zeta,spring.omega)) > .003) settle = ms;
    const points = Array.from({length:25},(_,index) => index === 24 ? 1 : +springResponse(index/24*settle/1000,spring.zeta,spring.omega).toFixed(3));
    spring.duration = settle;
    spring.easing = 'linear(' + points.join(',') + ')';
  });
  const supportsLinear = window.CSS?.supports?.('transition-timing-function','linear(0,1)');
  const spring = (name,extra = {}) => supportsLinear
    ? {duration:springs[name].duration,easing:springs[name].easing,...extra}
    : {duration:Math.round(springs[name].duration*.8),easing:snap,...extra};
  const active = new Set();
  const byElement = new WeakMap();
  const closingDialogs = new WeakSet();
  let observer = null;
  let initialized = false;
  let hero = null;
  let masthead = null;
  let chapters = [];
  let transect = null;
  let summitReached = false;
  let summitDot = null;
  let wasScrolled = null;
  let ghost = null;
  let scanLine = null;
  let heroSettled = false;
  let cloudGhost = null;
  const onceObservers = new Map();
  const onceHandlers = new Map();
  const styleValues = new WeakMap();

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
  }
  // Run a handler the first time an element is mostly on screen.
  function once(element,handler,threshold = .3) {
    if (!element || reduced.matches || !('IntersectionObserver' in window)) return false;
    if (!onceObservers.has(threshold)) onceObservers.set(threshold,new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      onceObservers.get(threshold).unobserve(entry.target);
      const run = onceHandlers.get(entry.target);
      onceHandlers.delete(entry.target);
      run?.(entry.target);
    }),{threshold}));
    onceHandlers.set(element,handler);
    onceObservers.get(threshold).observe(element);
    return true;
  }
  function animate(element,frames,options = {},inView = null) {
    if (!element) return null;
    byElement.get(element)?.cancel();
    if (reduced.matches || document.hidden || !element.animate || !(inView ?? visible(element))) return null;
    const animation = element.animate(frames,{duration:260,easing:ease,fill:'none',...options});
    active.add(animation);
    byElement.set(element,animation);
    const release = () => {
      active.delete(animation);
      if (byElement.get(element) === animation) byElement.delete(element);
    };
    animation.finished.then(release,release);
    return animation;
  }
  // A value settles into place: the text is already final, only its position and ink arrive.
  function settle(element,distance = '.08em',delay = 0) {
    return animate(element,[{opacity:.35,transform:'translateY(' + distance + ')'},{opacity:1,transform:'translateY(0)'}],spring('soft',{delay}));
  }
  function splitLines(heading) {
    // Wrap each <br>-separated line once; a language switch replaces the markup and removes the wrappers.
    if (!heading.querySelector(':scope > .line-mask')) {
      heading.innerHTML = heading.innerHTML.split(/<br\s*\/?>/i).map(line => '<span class="line-mask"><span>' + line + '</span></span>').join('');
    }
    return [...heading.querySelectorAll(':scope > .line-mask > span')];
  }
  function reveal(element,delay = 0) {
    // Content is visible by default, including when scripts or observers fail.
    if (element.contains(document.activeElement)) return;
    if (element.matches('h2')) {
      splitLines(element).forEach((line,index) => animate(line,[
        {transform:'translateY(105%)'},{transform:'translateY(0)'}
      ],spring('rise',{delay:delay+index*70,fill:'backwards'}),true));
      return;
    }
    animate(element,[{opacity:0,transform:'translateY(22px)'},{opacity:1,transform:'translateY(0)'}],spring('rise',{delay,fill:'backwards'}));
  }
  function sceneChanged(previousSource,direction = 1) {
    const image = document.getElementById('map-image');
    const world = document.getElementById('map-world');
    if (!image || !world) return;
    ghost?.remove();
    ghost = null;
    const forward = direction >= 0;
    // The previous sky stays underneath; the next one is scanned across it, like a satellite pass.
    if (previousSource && !reduced.matches && visible(image)) {
      ghost = image.cloneNode();
      ghost.removeAttribute('id');
      ghost.className = 'map-ghost';
      ghost.alt = '';
      ghost.setAttribute('aria-hidden','true');
      ghost.src = previousSource;
      world.insertBefore(ghost,image);
      if (!scanLine) {
        scanLine = document.createElement('span');
        scanLine.setAttribute('aria-hidden','true');
        world.insertBefore(scanLine,image.nextSibling);
      }
      scanLine.className = 'scan-line' + (forward ? '' : ' is-reverse');
    }
    const from = forward ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)';
    const timing = {duration:640,easing:sweep};
    const pass = animate(image,[{clipPath:from},{clipPath:'inset(0 0 0 0)'}],timing);
    const current = ghost;
    const clear = () => { if (ghost === current) { current?.remove(); ghost = null; } };
    if (pass) pass.finished.then(clear,clear);
    else clear();
    if (pass && scanLine) animate(scanLine,[
      {transform:'translateX(' + (forward ? '-100%' : '100%') + ')',opacity:1},
      {opacity:1,offset:.82},
      {transform:'translateX(0)',opacity:0}
    ],timing,true);
    document.querySelectorAll('.map-data-overlay .map-metric strong').forEach((value,index) => settle(value,'6px',120+index*45));
    animate(document.getElementById('scene-counter'),[
      {opacity:0,transform:'translateY(' + (forward ? '60%' : '-60%') + ')'},{opacity:1,transform:'translateY(0)'}
    ],spring('snappy'));
    animate(document.querySelector('.map-corner .live-dot'),[
      {boxShadow:'0 0 0 0 rgb(166 255 229 / .7)'},{boxShadow:'0 0 0 7px rgb(166 255 229 / 0)'}
    ],{duration:620,easing:'ease-out'});
  }
  function readingChanged() {
    settle(document.querySelector('.delta-number'));
    ['summit-now','valley-now'].forEach((id,index) => settle(document.getElementById(id)?.parentElement,'5px',40+index*40));
  }
  function playTick() {
    // Each playback step rings once at the reading, so the cadence is visible without moving the data.
    const svg = document.getElementById('analysis-chart');
    const point = svg?.querySelector('.chart-point');
    if (!point || point.getAttribute('visibility') === 'hidden') return;
    let ping = svg.querySelector('.chart-ping');
    if (!ping) {
      ping = document.createElementNS('http://www.w3.org/2000/svg','circle');
      ping.setAttribute('class','chart-ping');
      ping.setAttribute('r','4.5');
      point.before(ping);
    }
    ping.setAttribute('cx',point.getAttribute('cx'));
    ping.setAttribute('cy',point.getAttribute('cy'));
    animate(ping,[{opacity:.55,transform:'scale(1)'},{opacity:0,transform:'scale(3.2)'}],{duration:700,easing:'cubic-bezier(.2,.6,.3,1)'});
    animate(document.querySelector('.delta-number'),[{opacity:.7},{opacity:1}],{duration:220,easing:'ease-out'});
  }
  function dayChanged() {
    const svg = document.getElementById('analysis-chart');
    if (!svg) return;
    animate(svg.querySelector('.chart-band'),[{transform:'scaleX(.35)',opacity:.2},{transform:'scaleX(1)',opacity:1}],spring('snappy'));
    const selected = svg.querySelector('.chart-selected');
    const length = selected?.getTotalLength?.();
    if (Number.isFinite(length) && length > 0) animate(selected,[
      {strokeDasharray:String(length),strokeDashoffset:String(length)},
      {strokeDasharray:String(length),strokeDashoffset:'0'}
    ],{duration:420,easing:snap});
    animate(svg.querySelector('.chart-point'),[{transform:'scale(0)'},{transform:'scale(1)'}],spring('pop',{delay:120,fill:'backwards'}));
  }
  function cloudChanged(previousX) {
    settle(document.querySelector('.cloud-number'),'.06em');
    const cursor = document.querySelector('#cth-chart .cth-cursor');
    if (cursor && Number.isFinite(previousX)) {
      const offset = previousX-Number(cursor.getAttribute('x'));
      animate(cursor,[{transform:'translateX(' + offset + 'px)'},{transform:'translateX(0)'}],spring('soft'));
    }
    animate(document.querySelector('#cth-chart .cth-point'),[{transform:'scale(.2)'},{transform:'scale(1)'}],spring('pop'));
  }
  function landMarkers(container) {
    // Stations drop onto the map one after the other; their names slide out once they have landed.
    container?.querySelectorAll('.map-marker').forEach((marker,index) => {
      animate(marker,[{scale:'0',opacity:0},{scale:'1',opacity:1}],spring('pop',{delay:180+index*120,fill:'backwards'}),true);
      animate(marker.querySelector('b'),[{opacity:0,translate:'-8px 0'},{opacity:1,translate:'0 0'}],{duration:420,delay:320+index*120,easing:snap,fill:'backwards'},true);
    });
  }
  function revealClouds(stage) {
    // FCI scans the disc from south to north, so the cloud layer is swept in from the bottom edge.
    const canvas = document.getElementById('cloud-canvas');
    if (!canvas) return;
    canvas.style.removeProperty('opacity');
    const timing = {duration:1100,easing:sweep};
    const pass = animate(canvas,[{clipPath:'inset(100% 0 0 0)'},{clipPath:'inset(0 0 0 0)'}],timing,true);
    if (pass) {
      const line = document.createElement('span');
      line.className = 'scan-line is-up';
      line.setAttribute('aria-hidden','true');
      canvas.after(line);
      const sweepLine = animate(line,[{transform:'translateY(100%)',opacity:1},{opacity:1,offset:.85},{transform:'translateY(0)',opacity:0}],timing,true);
      const remove = () => line.remove();
      if (sweepLine) sweepLine.finished.then(remove,remove);
      else remove();
    }
    landMarkers(stage.querySelector('#cth-markers'));
  }
  function revealDistribution(svg) {
    // Scans fill in left to right, in time order; the median line follows them across.
    const cells = [...svg.querySelectorAll('.cth-cell')];
    const columns = cells.reduce((count,cell) => Math.max(count,Number(cell.dataset.col)+1),0);
    const step = Math.min(40,520/Math.max(1,columns));
    cells.forEach(cell => animate(cell,[{opacity:0,transform:'scaleY(.2)'},{opacity:1,transform:'scaleY(1)'}],
      spring('soft',{delay:Number(cell.dataset.col)*step,fill:'backwards'}),true));
    const line = svg.querySelector('.cth-line');
    const area = line?.getBBox?.();
    const left = Number(cells[0]?.getAttribute('x'));
    const cellWidth = Number(cells[0]?.getAttribute('width'))+2;
    // The line's edge trails the columns by a beat, so it only ever crosses cells that are already there.
    if (area?.width && cellWidth > 0) animate(line,[{clipPath:'inset(-50% 100% -50% 0)'},{clipPath:'inset(-50% 0 -50% 0)'}],
      {duration:area.width/cellWidth*step,delay:180+(area.x-left)/cellWidth*step,easing:'linear',fill:'backwards'},true);
    animate(svg.querySelector('.cth-cursor'),[{opacity:0},{opacity:1}],{duration:300,delay:columns*step+300,fill:'backwards'},true);
    animate(svg.querySelector('.cth-point'),[{transform:'scale(0)'},{transform:'scale(1)'}],spring('pop',{delay:columns*step+360,fill:'backwards'}),true);
  }
  function cloudsReady() {
    const stage = document.querySelector('.cth-stage');
    const canvas = document.getElementById('cloud-canvas');
    // Hold the cloud layer back until it can be swept in on screen; without observers it simply shows.
    if (stage && canvas && once(stage,revealClouds)) canvas.style.opacity = '0';
    once(document.getElementById('cth-chart'),revealDistribution,.25);
  }
  function cloudFrameWillChange(direction) {
    // The outgoing scan stays underneath while the next one wipes across it in the direction of time.
    const canvas = document.getElementById('cloud-canvas');
    if (!canvas || reduced.matches || document.hidden || !visible(canvas)) return;
    cloudGhost?.remove();
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.className = 'cloud-ghost';
    copy.setAttribute('aria-hidden','true');
    copy.getContext('2d')?.drawImage(canvas,0,0);
    canvas.before(copy);
    cloudGhost = copy;
    const forward = direction >= 0;
    // The cells are translucent, so the old scan recedes exactly where the new one arrives: never two scans on one cell.
    const timing = {duration:360,easing:snap};
    const pass = animate(canvas,[{clipPath:forward ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)'},{clipPath:'inset(0 0 0 0)'}],timing);
    if (pass) animate(copy,[{clipPath:'inset(0 0 0 0)'},{clipPath:forward ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)'}],timing,true);
    const clear = () => { if (cloudGhost === copy) { copy.remove(); cloudGhost = null; } };
    if (pass) pass.finished.then(clear,clear);
    else clear();
  }
  function setupHeroParallax() {
    // A mouse gives the landscape a little depth: the photograph and the title drift apart. Touch never moves it.
    if (!hero || !window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    hero.classList.add('has-parallax');
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;
    const step = () => {
      x += (targetX-x)*.08;
      y += (targetY-y)*.08;
      if (Math.abs(targetX-x) < .002 && Math.abs(targetY-y) < .002) { x = targetX; y = targetY; frame = 0; }
      else frame = requestAnimationFrame(step);
      setStyle(hero,'--parallax-x',x.toFixed(3));
      setStyle(hero,'--parallax-y',y.toFixed(3));
    };
    const aim = (nextX,nextY) => {
      targetX = reduced.matches ? 0 : nextX;
      targetY = reduced.matches ? 0 : nextY;
      if (!frame) frame = requestAnimationFrame(step);
    };
    hero.addEventListener('pointermove',event => {
      if (event.pointerType !== 'mouse') return;
      const rect = hero.getBoundingClientRect();
      aim((event.clientX-rect.left)/rect.width*2-1,(event.clientY-rect.top)/rect.height*2-1);
    });
    hero.addEventListener('pointerleave',() => aim(0,0));
  }
  function setupTerrainFade() {
    const terrain = document.getElementById('cth-image');
    if (!terrain || terrain.complete) return;
    terrain.addEventListener('load',() => animate(terrain,[{opacity:0},{opacity:1}],{duration:700,easing:'ease-out'}),{once:true});
  }
  function resetCloudMotion() {
    const cursor = document.querySelector('#cth-chart .cth-cursor');
    if (cursor) byElement.get(cursor)?.cancel();
  }
  function setupStationLinks() {
    const buttons = [...document.querySelectorAll('[data-map-station]')];
    let pinned = '';
    let hovered = '';
    let focused = '';
    const markers = new Map();
    buttons.forEach(button => {
      const marker = document.querySelector('#map-markers .' + button.dataset.mapStation);
      if (!marker) return;
      button.disabled = false;
      const pulse = document.createElement('span');
      pulse.className = 'station-pulse';
      pulse.setAttribute('aria-hidden','true');
      marker.append(pulse);
      markers.set(button.dataset.mapStation,{marker,pulse});
    });
    const update = () => {
      const current = hovered || focused || pinned;
      buttons.forEach(button => {
        const key = button.dataset.mapStation;
        button.setAttribute('aria-pressed',String(key === pinned));
        button.parentElement.classList.toggle('is-linked',key === current);
        markers.get(key)?.marker.classList.toggle('is-linked',key === current);
      });
    };
    buttons.forEach(button => {
      const key = button.dataset.mapStation;
      button.addEventListener('pointerenter',event => {
        if (event.pointerType === 'touch') return;
        hovered = key; update();
      });
      button.addEventListener('pointermove',event => {
        if (event.pointerType === 'touch' || hovered === key) return;
        hovered = key; update();
      });
      button.addEventListener('pointerleave',() => { if (hovered === key) hovered = ''; update(); });
      button.addEventListener('pointercancel',() => { if (hovered === key) hovered = ''; update(); });
      button.addEventListener('focus',() => { hovered = ''; focused = key; update(); });
      button.addEventListener('blur',() => { if (focused === key) focused = ''; update(); });
      button.addEventListener('click',() => {
        pinned = pinned === key ? '' : key;
        if (!pinned) { hovered = ''; focused = ''; }
        update();
        if (pinned) animate(markers.get(key)?.pulse,[
          {opacity:.85,transform:'scale(.65)'},{opacity:0,transform:'scale(2.1)'}
        ],{duration:520,easing:'cubic-bezier(.2,.6,.3,1)'});
      });
      button.addEventListener('keydown',event => {
        hovered = '';
        if (event.key === 'Escape') { pinned = ''; focused = ''; }
        else focused = key;
        update();
      });
    });
  }
  function setupLanguagePill() {
    const group = document.querySelector('.language-switch');
    if (!group) return;
    const place = () => {
      const pressed = group.querySelector('[aria-pressed=true]');
      if (!pressed) return;
      setStyle(group,'--pill-x',pressed.offsetLeft + 'px');
      setStyle(group,'--pill-w',pressed.offsetWidth + 'px');
    };
    place();
    group.classList.add('has-pill');
    // aria-pressed is set by the language module; follow it rather than duplicate its logic.
    new MutationObserver(place).observe(group,{subtree:true,attributes:true,attributeFilter:['aria-pressed']});
    if ('ResizeObserver' in window) new ResizeObserver(place).observe(group);
    document.fonts?.ready.then(place);
  }
  function setupWordmark() {
    const mark = document.querySelector('.wordmark');
    const path = mark?.querySelector('path');
    if (!path) return;
    const draw = delay => animate(path,[{strokeDashoffset:1},{strokeDashoffset:0}],{duration:1100,delay,easing:sweep,fill:'backwards'},true);
    draw(120);
    mark.addEventListener('pointerenter',event => {
      if (event.pointerType !== 'touch' && !byElement.has(path)) draw(0);
    });
  }
  function setStyle(element,name,value) {
    if (!element) return;
    const values = styleValues.get(element) || new Map();
    const next = String(value);
    if (values.get(name) === next) return;
    values.set(name,next);
    styleValues.set(element,values);
    element.style.setProperty(name,next);
  }
  function dialogOpened(dialog) {
    animate(dialog,[{opacity:0,transform:'translateY(14px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],spring('soft'));
    dialog.querySelectorAll('.dialog-body section').forEach((section,index) => animate(section,[
      {opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}
    ],{duration:420,delay:90+index*45,easing:snap,fill:'backwards'},true));
  }
  function closeDialog(dialog) {
    if (!dialog.open || closingDialogs.has(dialog)) return;
    closingDialogs.add(dialog);
    dialog.dataset.closing = 'true';
    const animation = animate(dialog,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(6px) scale(.985)'}],{duration:150,easing:'cubic-bezier(.4,0,1,1)'});
    const finish = () => {
      closingDialogs.delete(dialog);
      delete dialog.dataset.closing;
      if (dialog.open) dialog.close();
    };
    if (animation) animation.finished.then(finish,finish);
    else finish();
  }
  function drawChart(svg) {
    const path = svg.querySelector('.chart-line');
    if (!path || reduced.matches) return;
    // A time series draws at a constant rate; each daily peak lands as the line reaches it.
    const duration = 1200;
    const lead = 240;
    const box = svg.viewBox.baseVal;
    // The axes are laid out first, so the line has somewhere to land.
    svg.querySelectorAll('.chart-grid').forEach((line,index) => animate(line,[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:640,delay:index*50,easing:snap,fill:'backwards'},true));
    svg.querySelectorAll('.chart-axis').forEach(label => animate(label,[{opacity:0},{opacity:1}],{duration:400,delay:120,fill:'backwards'},true));
    // One sweep edge crosses the plot at a constant rate; every mark appears as the edge reaches it.
    const bounds = path.getBBox();
    const start = bounds.x;
    const span = Math.max(1,bounds.width || (box ? box.width : 1));
    const reach = x => lead+Math.max(0,Math.min(1,(x-start)/span))*duration;
    const sweepIn = element => {
      if (!element) return;
      const area = element.getBBox();
      if (!area.width) return;
      animate(element,[{clipPath:'inset(-50% 100% -50% 0)'},{clipPath:'inset(-50% 0 -50% 0)'}],
        {duration:area.width/span*duration,delay:reach(area.x),easing:'linear',fill:'backwards'},true);
    };
    [path,svg.querySelector('.chart-band'),svg.querySelector('.chart-selected')].forEach(sweepIn);
    svg.querySelectorAll('.chart-peak').forEach(peak => {
      animate(peak,[{transform:'scale(0)'},{transform:'scale(1)'}],spring('pop',{delay:reach(Number(peak.getAttribute('cx'))),fill:'backwards'}),true);
    });
    const cursorX = Number(svg.querySelector('.chart-cursor')?.getAttribute('x1'));
    animate(svg.querySelector('.chart-cursor'),[{opacity:0},{opacity:1}],{duration:200,delay:reach(cursorX),fill:'backwards'},true);
    animate(svg.querySelector('.chart-point'),[{transform:'scale(0)'},{transform:'scale(1)'}],spring('pop',{delay:reach(cursorX),fill:'backwards'}),true);
  }
  function observeEntrances() {
    observer?.disconnect();
    if (reduced.matches || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (entry.target.dataset.entered === 'true') return;
        entry.target.dataset.entered = 'true';
        if (entry.target.id === 'analysis-chart') return drawChart(entry.target);
        const parts = entry.target.matches('.chapter-heading')
          ? entry.target.querySelectorAll(':scope > .eyebrow, .chapter-intro > h2, .chapter-intro > p, .chapter-intro > div')
          : entry.target.matches('.closing-links, .day-strip') ? entry.target.children : [entry.target];
        [...parts].filter(part => !part.matches('.day-indicator')).forEach((part,index) => reveal(part,index*(entry.target.matches('.day-strip') ? 35 : 60)));
      });
    },{threshold:.12,rootMargin:'0px 0px -4% 0px'});
    document.querySelectorAll('.chapter-heading, .thermal-composition, .weekly-finding, .day-strip, .cloud-composition, .distribution-heading, .closing h2, .closing-copy, .closing-links, #analysis-chart').forEach(element => {
      if (element.dataset.entered !== 'true') observer.observe(element);
    });
  }
  function measureScroll(frame) {
    if (!masthead || !hero) return null;
    const headerBottom = frame.rect(masthead).bottom;
    const distance = frame.scrollHeight-frame.height;
    const progress = distance > 0 ? Math.min(1,frame.scrollY/distance) : 0;
    const chapterProgress = chapters.map(({section}) => {
      const rect = frame.rect(section);
      return Math.max(0,Math.min(1,(headerBottom-rect.top)/Math.max(1,rect.height-frame.height+headerBottom)));
    });
    let altitude = 1;
    let pulseVisible = false;
    if (transect && !reduced.matches) {
      const rect = frame.rect(transect);
      const travel = Math.min(rect.height,frame.height*.5)+frame.height*.18;
      altitude = Math.max(0,Math.min(1,(frame.height*.87-rect.top)/Math.max(1,travel)));
      if (altitude >= .98 && !summitReached && summitDot) {
        const dot = frame.rect(summitDot);
        pulseVisible = dot.bottom > 0 && dot.top < frame.height && dot.width > 0;
      }
    }
    const heroRange = Math.max(1,frame.rect(hero).height);
    return {progress,chapterProgress,altitude,pulseVisible,scrolled:frame.scrollY > 24,
      heroShift:reduced.matches ? '0px' : Math.min(26,frame.scrollY*.045).toFixed(2)+'px',
      // The landscape leans in as the reader leaves it; capped so the photograph never crops its peaks.
      heroZoom:reduced.matches ? '1' : (1+Math.min(1,frame.scrollY/heroRange)*.06).toFixed(4)};
  }
  function updateScroll(value) {
    if (!value) return;
    setStyle(masthead,'--reading-progress',value.progress.toFixed(4));
    if (wasScrolled !== value.scrolled) {
      wasScrolled = value.scrolled;
      masthead.classList.toggle('has-scrolled',value.scrolled);
    }
    chapters.forEach(({links},index) => links.forEach(link => setStyle(link,'--chapter-progress',value.chapterProgress[index].toFixed(4))));
    setStyle(transect,'--altitude-reveal',value.altitude.toFixed(4));
    setStyle(hero,'--hero-shift',value.heroShift);
    setStyle(hero,'--hero-zoom',value.heroZoom);
    if (value.scrolled && !heroSettled) {
      heroSettled = true;
      byElement.get(document.querySelector('.arrow-circle'))?.cancel();
    }
    if (value.pulseVisible && !summitReached) {
      summitReached = true;
      animate(summitDot,[
        {boxShadow:'0 0 0 0px rgb(40 92 73 / .45)'},
        {boxShadow:'0 0 0 16px rgb(40 92 73 / 0)'}
      ],{duration:520,easing:'cubic-bezier(.2,.6,.3,1)'},true);
    }
  }
  function enterHero() {
    if (reduced.matches || window.scrollY >= 80) return;
    animate(document.querySelector('.hero-image'),[{opacity:.35,transform:'scale(1.07)'},{opacity:1,transform:'scale(1)'}],{duration:1800,easing:snap});
    // The word rises out of its own baseline; the line follows it in, then the prompt.
    animate(document.querySelector('.hero-word'),[
      {opacity:0,transform:'translateY(.28em)',clipPath:'inset(-20% -10% 100% -10%)'},
      {opacity:1,transform:'translateY(0)',clipPath:'inset(-20% -10% -20% -10%)'}
    ],spring('rise',{delay:120,fill:'backwards'}));
    animate(document.querySelector('.hero-line'),[{opacity:0,transform:'translateX(-.4em)'},{opacity:1,transform:'translateX(0)'}],spring('rise',{delay:300,fill:'backwards'}));
    [...document.querySelectorAll('.hero-meta, .hero-bottom > *')].forEach((element,index) => {
      animate(element,[{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],spring('rise',{delay:460+index*60,fill:'backwards'}));
    });
    // One quiet nudge toward the story, then rest. Never a loop.
    animate(document.querySelector('.arrow-circle'),[
      {translate:'0 0'},{translate:'0 6px',offset:.18},{translate:'0 -1px',offset:.42},{translate:'0 3px',offset:.62},{translate:'0 0'}
    ],{duration:1100,delay:2400,easing:'ease-in-out'});
  }
  function stopAnimations() {
    [...active].forEach(animation => animation.cancel());
    ghost?.remove();
    ghost = null;
    cloudGhost?.remove();
    cloudGhost = null;
  }
  function init() {
    if (initialized) return;
    initialized = true;
    hero = document.querySelector('.hero');
    masthead = document.querySelector('.masthead');
    transect = document.querySelector('.station-transect');
    summitDot = transect?.querySelector('.summit-station .station-dot');
    chapters = ['week','temperature','clouds'].map(id => ({
      section:document.getElementById(id),
      links:[...document.querySelectorAll('.masthead a[href="#' + id + '"]')]
    })).filter(chapter => chapter.section);
    setupStationLinks();
    setupLanguagePill();
    setupWordmark();
    setupHeroParallax();
    setupTerrainFade();
    once(document.getElementById('viirs-panel'),panel => landMarkers(panel.querySelector('#map-markers')));
    enterHero();
    observeEntrances();
    window.CLOUD_ATLAS_VIEWPORT.subscribe({measure:measureScroll,update:updateScroll});
    window.addEventListener('pagehide',stopAnimations);
    document.addEventListener('visibilitychange',() => { if (document.hidden) stopAnimations(); });
    document.addEventListener('focusin',event => {
      for (const animation of active) {
        const target = animation.effect?.target;
        if (target?.contains(event.target) && !target.matches('dialog')) animation.cancel();
      }
    });
    reduced.addEventListener('change',() => {
      if (reduced.matches) stopAnimations();
      observeEntrances();
      window.CLOUD_ATLAS_VIEWPORT.request();
    });
  }
  return {init,sceneChanged,readingChanged,playTick,dayChanged,cloudsReady,cloudFrameWillChange,cloudChanged,resetCloudMotion,dialogOpened,closeDialog};
})();
