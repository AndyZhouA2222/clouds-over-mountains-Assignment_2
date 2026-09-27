'use strict';
window.CLOUD_ATLAS_VIEWPORT = (() => {
  const subscribers = new Set();
  let pending = 0;
  let resized = true;

  function flush() {
    pending = 0;
    const rectangles = new Map();
    const frame = {
      width:window.innerWidth,
      height:window.innerHeight,
      scrollY:Math.max(0,window.scrollY),
      scrollHeight:document.documentElement.scrollHeight,
      resized,
      rect(element) {
        if (!rectangles.has(element)) rectangles.set(element,element.getBoundingClientRect());
        return rectangles.get(element);
      }
    };
    resized = false;
    // Share measurements, and finish every read before applying any DOM updates.
    const updates = [...subscribers].map(subscriber => [subscriber,subscriber.measure(frame)]);
    updates.forEach(([subscriber,value]) => subscriber.update(value));
  }
  function request(options = {}) {
    if (options.resize) resized = true;
    if (!pending) pending = requestAnimationFrame(flush);
  }
  function subscribe(subscriber) {
    subscribers.add(subscriber);
    request({resize:true});
    return () => subscribers.delete(subscriber);
  }
  window.addEventListener('scroll',() => request(),{passive:true});
  window.addEventListener('resize',() => request({resize:true}),{passive:true});
  window.addEventListener('load',() => request({resize:true}),{once:true});
  document.fonts?.ready.then(() => request({resize:true}));
  return {subscribe,request};
})();
