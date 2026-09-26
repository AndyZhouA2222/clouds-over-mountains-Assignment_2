'use strict';
window.CLOUD_ATLAS_I18N = (() => {
  const zh = {
    skip:'跳至观测数据', chapters:'章节导航', navWeek:'七日天空', navTemp:'从谷到峰', navCloud:'云层之上', sources:'数据来源',
    heroMeta:'阿尔卑斯山地观测', heroWord:'山上有云', heroLine:'云下是山。', enter:'循着天空，向下探索', heroDate:'9 月 14—20 日<br>2026 / UTC',
    heroDesc:'七天，两处海拔。一片不断变化的阿尔卑斯天空。', heroCredit:'摄影：GABRIEL GARCIA MARENGO / UNSPLASH · 山地景观配图 ↗',
    weekEyebrow:'凝视这片山地', weekTitle:'同一片山。<br>七日流动的天空。',
    weekIntro:'随滚动翻阅一周的真实卫星影像。每幅图都是当日合成；地面的温度则来自两座气象站的逐小时观测。',
    dailyNote:'真彩色日合成 · 滚动切换日期', mapExtent:'320 × 200 km 投影范围', weekFallback:'天空中的七日。',
    mapPeakLabel:'当日最大 ΔT', mapGroundTime:'DWD · {time} UTC',
    mapGroundNote:'卫星图为当日合成；两站气温取当天最大温差时刻。',
    locateValley:'在地图上定位 Garmisch 山谷站', locateSummit:'在地图上定位 Zugspitze 山顶站',
    stationHint:'点击站点气温，在地图上定位；再次点击可取消。',
    mapGroundSummary:'{date}，{time} UTC：山谷 {valley} °C，山顶 {summit} °C；当日最大温差 {delta} °C。',
    zoomOut:'缩小卫星地图', zoomIn:'放大卫星地图', reset:'恢复完整地图范围', imageError:'这幅卫星影像暂时无法载入。',
    imageLoading:'正在载入 {date} 的影像…', imageLoadError:'{date} 的影像未能载入。', imageReady:'当前影像：{date}',
    retryImage:'重试影像', retryTerrain:'重试底图', retrying:'正在重试…',
    terrainLoading:'正在载入地形参考底图…', terrainReady:'地形参考底图 · 影像日期未知',
    weekNext:'接下来，从天空走向地面的气象站。', tempEyebrow:'感受海拔的距离', tempTitle:'不远的路程。<br>不一样的温度。',
    tempIntro:'山谷与山顶的气象站相距约八公里，垂直高差却有 2,237 米。选择日期和小时，感受温差的起伏。',
    elevations:'两座气象站的海拔示意', summit:'山顶', valley:'山谷', vertical:'垂直高差', difference:'两站温差 / ΔT', formula:'山谷气温 − 山顶气温',
    explore:'探索逐小时观测', selectDay:'选择观测日期', selectHour:'选择观测小时', chartTitle:'完整的一周，连续的时间。', chartLegend:'逐小时温差', peakLegend:'每日峰值',
    chartAria:'七天逐小时山谷减山顶温差曲线，纵轴为 ΔT，单位摄氏度；圆点为每日峰值，阴影为选定日期',
    findingLabel:'这一周的发现 / 9 月 14–20 日',
    weekFindingPositive:'全部 {count} 个已观测小时中，山谷都比山顶更暖：小时温差为 {min}–{max} °C，日峰值为 {peakMin}–{peakMax} °C。',
    weekFindingRange:'在 {count} 个有效小时观测中，山谷减山顶的温差为 {min}–{max} °C，日峰值为 {peakMin}–{peakMax} °C。',
    instrumentNote:'168 组配对观测 · UTC 时间 · 单位 °C · 阴影为选定日期。卫星图为日合成，不随小时变化。',
    cloudEyebrow:'再向上看一点', cloudTitle:'另一天。<br>另一层天空。', cloudSource:'DWD / FCI / 云顶高度', cloudDate:'2026 年 9 月 22 日',
    cloudIntro:'9 月 22 日，十三次卫星扫描记录了云顶的高度。移动时间滑块，观察高度分布如何变化。',
    dateNote:'2026 年 9 月 22 日——独立于前面七日温度研究的参考观测。',
    terrainAlt:'Esri World Imagery 地形参考底图，影像日期未知', terrainError:'地形参考底图暂时无法载入。云高数据仍可查看。',
    heightLegend:'云顶高度 / km', transparent:'透明表示没有有效云高值，不一定代表晴空。', regionalMedian:'区域云高中位数',
    medianExplanation:'当前帧所有有效云格点中，位于中间的云顶高度。', middle80:'第 10–90 百分位', validCells:'有效格点', observation:'观测时间',
    selectCloud:'逐帧查看云顶扫描', distributionTitle:'云的高度，也有形状。',
    distributionNote:'每一列是一次扫描。越亮的格子表示该高度段的有效格点占比越高；白线标记中位数所在高度段。最上层包含所有 ≥ 4.5 km 的云高。',
    cthChartAria:'选择云顶观测帧，可使用左右方向键、Home 和 End 键',
    distributionScale:'所有帧共用同一亮度标尺。点击列或使用方向键选择时间。',
    closingEyebrow:'从这里望出去', closingTitle:'天空在变化。<br>问题仍然敞开。',
    closingCopy:'温差讲述一部分故事，云高讲述另一部分。这些观测让我们看得更细，但它们来自不同日期，不能据此确立两者的关系。',
    downloadTemp:'下载气温数据', downloadCloud:'下载云高格网', backTop:'回到天空',
    closingNote:'一项探索性的山地观测。温差或云高本身，都不能单独判定积雨云。', footer:'仔细看，继续问。',
    provenance:'数据出处与背景', sourcesTitle:'观测从哪里来。', close:'关闭数据来源',
    sourceTempTitle:'地面 / DWD 气温',
    sourceTemp:'01550 Garmisch-Partenkirchen（719 m）与 05792 Zugspitze（2,956 m）气象站。2026 年 9 月 14–20 日，共 336 条小时记录、168 组配对。原始时间为 UTC，单位 °C，缺测不插补。近期数据的 QN9=1 仅代表形式检查，尚非完整质量控制。',
    sourceCloudTitle:'天空 / DWD 云顶高度',
    sourceCloud:'2026 年 9 月 22 日 06:08–18:08 UTC，共 13 帧。变量 cloud_top_height_FCI_IR10.5，单位米，44 × 99 格点。仅显示正云高且 opacity 为正的格点。此观测日与前面的七日气温研究不同。',
    sourceImageTitle:'山地 / NASA 与 Esri',
    sourceImage:'NASA GIBS 提供的 2026 年 9 月 14–20 日 Suomi NPP / VIIRS 真彩色日合成。地形参考使用 Esri World Imagery，采集日期未知。默认缩放下，两幅地图保持同一 1440 × 900 EPSG:3857 范围。',
    sourceLimitTitle:'这些观测能告诉我们什么',
    sourceLimit:'页面不做云型分类或因果推断。这是一项探索研究，不构成天气预报或拍摄条件保证。两座气象站位于不同位置与海拔。',
    title:'山上有云 — 楚格峰山地观测', description:'翻阅楚格峰地区七日卫星影像与山谷、山顶逐小时气温，再探索独立日期的云顶高度。',
    play:'播放逐小时观测', pause:'暂停逐小时观测', dayAria:'选择 {date} 的观测', dailyPeak:'日峰值', peakNote:'日峰值 {value} °C / {time} UTC',
    dayCount:'第 {n} 天 / 共 7 天', peakStory:'最大温差出现在 {time} UTC。拖动下一章节的时间滑块，可查看这一天的全部小时观测。',
    imageAlt:'{date} 楚格峰地区 NASA VIIRS 真彩色日合成卫星影像', selectedHour:'{date} / {time} UTC，温差 {value} °C',
    cloudValue:'{time} UTC，云高中位数 {value} km', unavailable:'暂无有效数据', dataError:'观测数据未能载入。请确认 data 文件夹与页面一同保留。',
    cloudError:'云顶高度数据未能载入。气温观测仍可使用。', month:'9月', chartDay:'日'
  };
  const en = {
    mapGroundTime:'DWD · {time} UTC',
    mapGroundSummary:'{date}, {time} UTC: valley {valley} °C, summit {summit} °C; daily maximum difference {delta} °C.',
    imageLoading:'Loading the image for {date}…', imageLoadError:'The image for {date} could not be loaded.', imageReady:'Showing {date}',
    retryImage:'Retry image', retryTerrain:'Retry terrain', retrying:'Retrying…',
    terrainLoading:'Loading the reference terrain…', terrainReady:'Reference terrain · imagery date unknown',
    terrainError:'The reference terrain could not be loaded. Cloud values remain available.',
    weekFindingPositive:'In all {count} observed hours, the valley was warmer than the summit: the hourly gap was {min}–{max} °C, with daily peaks of {peakMin}–{peakMax} °C.',
    weekFindingRange:'Across {count} valid hourly observations, the valley-minus-summit temperature gap was {min}–{max} °C, with daily peaks of {peakMin}–{peakMax} °C.',
    title:'Clouds over mountains — A Zugspitze field study', description:'A journey through seven days of satellite imagery and alpine temperatures around Zugspitze, with a separate cloud-height study.',
    play:'Play hourly observations', pause:'Pause hourly observations', dayAria:'Select observations for {date}', dailyPeak:'DAILY PEAK', peakNote:'Daily peak {value} °C / {time} UTC',
    dayCount:'DAY {n} OF 7', peakStory:'The largest temperature difference arrives at {time} UTC. Explore every hourly reading in the next chapter.',
    imageAlt:'NASA VIIRS daily composite of the Zugspitze region, {date}', selectedHour:'{date} / {time} UTC, temperature difference {value} °C',
    cloudValue:'{time} UTC, median cloud height {value} km', unavailable:'No valid data', dataError:'Observation data could not be loaded. Keep the data folder alongside this page.',
    cloudError:'Cloud-height data could not be loaded. Temperature observations are still available.', month:'SEP', chartDay:''
  };
  let language = 'en';
  const bindings = [];
  function init() {
    document.querySelectorAll('[data-i18n],[data-i18n-aria],[data-i18n-alt]').forEach(element => {
      for (const [attribute, target] of [['data-i18n',null],['data-i18n-aria','aria-label'],['data-i18n-alt','alt']]) {
        const key = element.getAttribute(attribute);
        if (!key) continue;
        en[key] = target ? element.getAttribute(target) : element.innerHTML;
        bindings.push({element,key,target});
      }
    });
  }
  function t(key, values = {}) {
    const text = (language === 'zh' ? zh[key] : en[key]) ?? en[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
  }
  function set(next) {
    language = next === 'zh' ? 'zh' : 'en';
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = t('title');
    document.querySelector('meta[name="description"]').content = t('description');
    bindings.forEach(({element,key,target}) => {
      if (target) element.setAttribute(target, t(key));
      else element.innerHTML = t(key);
    });
    document.querySelectorAll('[data-lang]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.lang === language)));
    document.querySelector('.language-switch').setAttribute('aria-label', language === 'zh' ? '界面语言' : 'Language');
    document.querySelector('.wordmark').setAttribute('aria-label', language === 'zh' ? '山上有云 — 返回首页' : 'Clouds over mountains — home');
  }
  function date(value, full = false) {
    const day = Number(value.slice(8,10));
    return language === 'zh' ? (full ? '2026 年 ' : '') + '9 月 ' + day + ' 日' : day + ' SEP' + (full ? ' 2026' : '');
  }
  return {init, set, t, date, get language(){return language;}};
})();
