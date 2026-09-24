# Clouds over the Zugspitze

![Seven NASA VIIRS daily cloud images and the hourly valley-to-summit temperature difference](out/plot.svg)

## The phenomenon

Clouds continually form and change over the Alps as air rises across steep terrain. This project looks at the Zugspitze region in southern Germany and asks how the hourly air-temperature difference between a nearby valley station and the mountain summit changed during 14–20 September 2026. Satellite images provide a visual record of cloud patterns over the same seven days. The temperature contrast is a prompt for exploration, not a proxy for thunderstorms.

## The source

The two original hourly station archives are published by the [Deutscher Wetterdienst (DWD)](https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/air_temperature/recent/). Each ZIP contains station rows with a UTC observation time, a quality flag, and air temperature (`TT_TU`) in degrees Celsius. The selected week has 336 station records, paired into 168 hourly observations from Garmisch-Partenkirchen (719 m) and Zugspitze (2,956 m). The [NASA GIBS VIIRS layer](https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi) supplies one 1440 × 900 true-colour daily composite for each date; the unchanged JPEG responses are kept in `data/raw/`. The DWD cloud-top-height archive is also available in `data/raw/` as a separate 22 September reference; it does not overlap the plotted week. Download URLs and checksums are recorded in `data/download-sources.json` and `data/imagery-sources.json`.

## What the picture shows

The seven upper panels are the downloaded NASA VIIRS daily composites, all covering the same map extent; the lower line is the hourly difference `valley temperature − summit temperature`, with one marker for each day's maximum. The chart keeps the paired station values and dates but does not show local terrain at station scale or the acquisition time of each satellite pixel. The stations are about 8 km apart, DWD's recent-data flag (`QN_9 = 1`) is a formal check rather than full quality control, and neither source identifies cumulonimbus or proves that temperature difference caused a cloud pattern.

An interactive companion is available in `index.html`; its cloud-top-height layer is explicitly dated 22 September and is kept separate from the seven-day comparison. All analysis reads committed local files, so plotting works without network access.

## Run it

```bash
uv run plot.py
```
