'use strict';
window.CLOUD_ATLAS_MOTION = (() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.2,.7,.2,1)';
  const active = new Set();
  const byElement = new WeakMap();
  const closingDialogs = new WeakSet();
  let observer = null;
  let initialized = false;
  let scrollFrame = 0;
  let hero = null;
  let masthead = null;
  let chapters = [];
  let transect = null;
  let summitReached = false;

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
  }
  function animate(element,frames,options = {}) {
    if (!element) return null;
    byElement.get(element)?.cancel();
    if (reduced.matches || document.hidden || !element.animate || !visible(element)) return null;
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
  function reveal(element,delay = 0) {
    // Content is visible by default, including when scripts or observers fail.
    if (element.contains(document.activeElement)) return;
    animate(element,[{opacity:.18,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,delay,fill:'backwards'});
  }
  function sceneChanged() {
    const image = document.getElementById('map-image');
    // Only reveal the new, decoded image. Its map coordinates never move.
    animate(image,[{opacity:.7,clipPath:'inset(0 7% 0 0)'},{opacity:1,clipPath:'inset(0 0 0 0)'}]);
    animate(document.querySelector('.map-data-overlay'),[
      {opacity:.65,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}
    ],{duration:220});
  }
  function readingChanged() {
    animate(document.querySelector('.delta-number'),[{opacity:.65},{opacity:1}],{duration:140});
  }
  function cloudChanged(previousX) {
    animate(document.querySelector('.cloud-number'),[{opacity:.65},{opacity:1}],{duration:140});
    const cursor = document.querySelector('#cth-chart .cth-cursor');
    if (cursor && Number.isFinite(previousX)) {
      const offset = previousX-Number(cursor.getAttribute('x'));
      animate(cursor,[{transform:'translateX(' + offset + 'px)'},{transform:'translateX(0)'}],{duration:150});
    }
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
      button.addEventListener('pointerleave',() => { hovered = ''; update(); });
      button.addEventListener('pointercancel',() => { hovered = ''; update(); });
      button.addEventListener('focus',() => { focused = key; update(); });
      button.addEventListener('blur',() => { focused = ''; update(); });
      button.addEventListener('click',() => {
        pinned = pinned === key ? '' : key;
        if (!pinned) { hovered = ''; focused = ''; }
        update();
        if (pinned) animate(markers.get(key)?.pulse,[
          {opacity:.85,transform:'scale(.65)'},{opacity:0,transform:'scale(2.1)'}
        ],{duration:280});
      });
      button.addEventListener('keydown',event => {
        if (event.key !== 'Escape') return;
        pinned = ''; hovered = ''; focused = ''; update();
      });
    });
  }
  function updateStoryProgress() {
    const headerBottom = masthead.getBoundingClientRect().bottom;
    chapters.forEach(({section,links}) => {
      const rect = section.getBoundingClientRect();
      const progress = Math.max(0,Math.min(1,(headerBottom-rect.top)/Math.max(1,rect.height-window.innerHeight+headerBottom)));
      links.forEach(link => link.style.setProperty('--chapter-progress',progress));
    });
    if (!transect) return;
    const rect = transect.getBoundingClientRect();
    const distance = Math.min(rect.height,window.innerHeight*.5)+window.innerHeight*.18;
    const progress = Math.max(0,Math.min(1,(window.innerHeight*.87-rect.top)/Math.max(1,distance)));
    transect.style.setProperty('--altitude-reveal',reduced.matches ? 1 : progress);
    if (progress >= .98 && !summitReached) {
      summitReached = true;
      animate(transect.querySelector('.summit-station .station-dot'),[
        {boxShadow:'0 0 0 0px rgb(40 92 73 / .45)'},
        {boxShadow:'0 0 0 16px rgb(40 92 73 / 0)'}
      ],{duration:280});
    }
  }
  function dialogOpened(dialog) {
    animate(dialog,[{opacity:0,transform:'translateY(10px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:240});
  }
  function closeDialog(dialog) {
    if (!dialog.open || closingDialogs.has(dialog)) return;
    closingDialogs.add(dialog);
    dialog.dataset.closing = 'true';
    const animation = animate(dialog,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(6px)'}],{duration:150,easing:'ease-out'});
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
    const length = path.getTotalLength();
    if (!Number.isFinite(length) || !length) return;
    animate(path,[
      {strokeDasharray:String(length),strokeDashoffset:String(length)},
      {strokeDasharray:String(length),strokeDashoffset:'0'}
    ],{duration:280});
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
          : [entry.target];
        [...parts].forEach((part,index) => reveal(part,index*40));
      });
    },{threshold:.12,rootMargin:'0px 0px -4% 0px'});
    document.querySelectorAll('.chapter-heading, .thermal-composition, .weekly-finding, .cloud-composition, .distribution-heading, .closing h2, .closing-copy, #analysis-chart').forEach(element => {
      if (element.dataset.entered !== 'true') observer.observe(element);
    });
  }
  function updateScroll() {
    scrollFrame = 0;
    if (!masthead || !hero) return;
    const y = Math.max(0,window.scrollY);
    const distance = document.documentElement.scrollHeight-window.innerHeight;
    const progress = distance > 0 ? Math.min(1,y/distance) : 0;
    masthead.style.setProperty('--reading-progress',progress);
    masthead.classList.toggle('has-scrolled',y > 24);
    updateStoryProgress();
    if (reduced.matches) {
      hero.style.removeProperty('--hero-shift');
      return;
    }
    const rect = hero.getBoundingClientRect();
    if (rect.bottom > 0) hero.style.setProperty('--hero-shift',Math.min(26,y*.045).toFixed(2)+'px');
  }
  function requestScroll() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }
  function stopAnimations() {
    [...active].forEach(animation => animation.cancel());
  }
  function init() {
    if (initialized) return;
    initialized = true;
    hero = document.querySelector('.hero');
    masthead = document.querySelector('.masthead');
    transect = document.querySelector('.station-transect');
    chapters = ['week','temperature','clouds'].map(id => ({
      section:document.getElementById(id),
      links:[...document.querySelectorAll('.masthead a[href="#' + id + '"]')]
    })).filter(chapter => chapter.section);
    setupStationLinks();
    if (!reduced.matches && window.scrollY < 80) {
      document.querySelectorAll('.hero-word, .hero-line, .hero-bottom').forEach((element,index) => {
        animate(element,[{opacity:0,transform:'translateY(22px)'},{opacity:1,transform:'translateY(0)'}],{duration:480,delay:index*40,fill:'backwards'});
      });
    }
    observeEntrances();
    updateScroll();
    window.addEventListener('scroll',requestScroll,{passive:true});
    window.addEventListener('resize',requestScroll,{passive:true});
    window.addEventListener('load',requestScroll,{once:true});
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
      updateScroll();
    });
  }
  return {init,sceneChanged,readingChanged,cloudChanged,dialogOpened,closeDialog};
})();
