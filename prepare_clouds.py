# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "netCDF4"]
# ///
"""Read the selected FCI cloud-height product with the standard NetCDF library."""
from pathlib import Path
from datetime import datetime, timezone
import bz2, json, hashlib, math
import numpy as np
from netCDF4 import Dataset, num2date

ROOT=Path(__file__).resolve().parent

def read_frame(path):
    with Dataset('memory',memory=bz2.decompress(path.read_bytes())) as d:
        lat=np.asarray(d['lat'][:]);lon=np.asarray(d['lon'][:])
        yi=np.where((lat>=46.78)&(lat<=48.07))[0];xi=np.where((lon>=9.52)&(lon<=12.46))[0]
        height=np.ma.filled(d['CTH'][0],-1)[np.ix_(yi,xi)]
        opacity=np.ma.filled(d['opa'][0],-1)[np.ix_(yi,xi)]
        height=np.where((height>=0)&(height<=25000),height,-1).astype(int)
        opacity=np.where((opacity>=0)&(opacity<=100),opacity,-1).astype(int)
        t=d['time'];instant=num2date(t[0],units=t.units,calendar=t.calendar)
        actual=instant.strftime('%Y-%m-%dT%H:%M:%SZ')
        nominal=datetime.strptime(path.name[5:17],'%Y%m%d%H%M').replace(tzinfo=timezone.utc)
        assert nominal.strftime('%Y-%m-%dT%H')==instant.strftime('%Y-%m-%dT%H')
        assert d['CTH'].units=='m' and 'FCI' in d['CTH'].long_name
        reference=datetime.strptime(actual,'%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
        assert np.all((height<=0)|(opacity>0)), 'Do not silently use inconsistent cloud-mask samples'
        frame={'utc':actual,'nominalUtc':nominal.isoformat().replace('+00:00','Z'),
               'hour':nominal.hour,'offsetMinutes':int((reference-nominal).total_seconds()/60),
               'values':height.tolist(),'opacity':opacity.tolist()}
        source={'file':path.relative_to(ROOT).as_posix(),'url':'https://opendata.dwd.de/weather/satellite/clouds/CTH/'+path.name,
                'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'timeUnits':t.units,'timeValue':float(t[0]),
                'actualUtc':actual,'nominalProductTime':getattr(d,'nominal_product_time',None),
                'variable':d['CTH'].long_name,'units':'m','fillValue':-1,'gridDegrees':0.03,'method':'satellite retrieval, not direct height measurement'}
        return frame,source,[round(float(v),5) for v in lat[yi]],[round(float(v),5) for v in lon[xi]]

def build():
    frames=[];sources=[];lats=lons=None
    for hour in range(6,19):
        f,s,la,lo=read_frame(ROOT/'data'/'raw'/f'CTHin20260922{hour:02d}00nEU.nc.bz2')
        if lats is not None:assert la==lats and lo==lons
        frames.append(f);sources.append(s);lats,lons=la,lo
    result={'kind':'satellite-retrieval','date':'2026-09-22','latitudes':lats,'longitudes':lons,'gridDegrees':.03,
            'frames':frames,'sources':sources,'notes':['CF time decoded with netCDF4.num2date, not inferred from the filename.',
             'Display only CTH>0 and opa>0. Zero is not labelled clear sky. Invalid values remain -1.',
             'The CTH unit is metres, not temperature. Do not infer cumulonimbus from this layer.',
             'Opacity is a coarse technical mask according to the DWD product description. No cloud coverage estimate is reported.']}
    (ROOT/'data'/'clouds.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (ROOT/'data'/'clouds.js').write_text('window.CLOUD_ATLAS_CTH = '+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
    print(json.dumps({'frames':len(frames),'grid':[len(lats),len(lons)],'times':[f['utc'] for f in frames],
                      'offsetMinutes':[f['offsetMinutes'] for f in frames]},indent=2))

if __name__=='__main__':build()
