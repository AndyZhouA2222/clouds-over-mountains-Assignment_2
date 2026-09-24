# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Rebuild the website dataset OFFLINE from the unmodified DWD ZIP snapshots."""
from pathlib import Path
from datetime import datetime, timezone
import csv
import io
import json
import hashlib
import zipfile

ROOT = Path(__file__).resolve().parent
DAYS = [f'2026-09-{day:02d}' for day in range(14, 21)]
STATIONS = [{'id':'01550','name':'Garmisch-Partenkirchen','label':'山谷','lat':47.4830,'lon':11.0621,'elevation':719},
            {'id':'05792','name':'Zugspitze','label':'山顶','lat':47.4210,'lon':10.9848,'elevation':2956}]

def read_station(station):
    path = ROOT / 'data' / 'raw' / f"stundenwerte_TU_{station['id']}_akt.zip"
    with zipfile.ZipFile(path) as archive:
        member = next(n for n in archive.namelist() if n.startswith('produkt_tu_stunde_'))
        content = archive.read(member).decode('utf-8')
        records = {}
        for row in csv.DictReader(io.StringIO(content), delimiter=';'):
            instant = datetime.strptime(row['MESS_DATUM'].strip(), '%Y%m%d%H').replace(tzinfo=timezone.utc)
            if instant.strftime('%Y-%m-%d') not in DAYS: continue
            raw_temperature = float(row['TT_TU'])
            records[instant.isoformat().replace('+00:00','Z')] = {
                'temperature': None if raw_temperature == -999 else raw_temperature,
                'quality': int(row['QN_9']),
            }
    source = {'provider':'Deutscher Wetterdienst (DWD) CDC','stationId':station['id'],
              'url':'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/air_temperature/recent/'+path.name,
              'file':path.relative_to(ROOT).as_posix(),'member':member,
              'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
              'savedUtc':datetime.fromtimestamp(path.stat().st_mtime,timezone.utc).isoformat(),
              'timeBasis':'UTC; verified against current TT_TU row of the ZIP parameter metadata',
              'unit':'degree Celsius','missingValue':-999,'qualityNote':'Recent data, quality control not completed; QN_9=1 means formal control only.'}
    return records, source

def build():
    records, sources = zip(*(read_station(s) for s in STATIONS))
    image_sources = json.loads((ROOT/'data'/'imagery-sources.json').read_text(encoding='utf-8'))
    geo = json.loads((ROOT/'data'/'download-sources.json').read_text(encoding='utf-8'))
    days = []
    for day in DAYS:
        frames=[]
        for hour in range(24):
            instant=f'{day}T{hour:02d}:00:00Z'
            observations=[r.get(instant,{'temperature':None,'quality':None}) for r in records]
            a,b=[o['temperature'] for o in observations]
            frames.append({'utc':instant,'hour':hour,'valley':a,'summit':b,
                           'delta':round(a-b,1) if a is not None and b is not None else None,
                           'quality':[o['quality'] for o in observations]})
        values=[f['delta'] for f in frames if f['delta'] is not None]
        days.append({'date':day,'image':next(s['file'] for s in image_sources if s['date']==day),
                     'frames':frames,'validPairs':len(values),'maxDelta':max(values) if values else None,
                     'minDelta':min(values) if values else None})
    data={'kind':'observed','version':'0.2','timezone':'UTC','stations':STATIONS,'days':days,
          'map':{'projection':'EPSG:3857','bbox':geo['bbox'],'width':1440,'height':900,
                 'terrain':'assets/terrain-mercator.jpg'},
          'sources':list(sources)+image_sources,
          'viewpoints':[{'id':'A','name':'Eibsee 北岸','subtitle':'湖面前景','lat':47.463,'lon':10.972},
                        {'id':'B','name':'Grainau 周边','subtitle':'山体轮廓','lat':47.473,'lon':11.025},
                        {'id':'C','name':'Garmisch 山谷','subtitle':'远景构图','lat':47.483,'lon':11.0621}],
          'limitations':['VIIRS is a daily composite, not hourly imagery. Exact per-pixel acquisition time is not provided here.',
                          'DWD recent values have provisional quality status; all missing values remain null.',
                          'No cumulonimbus classification, cloud height, camera elevation angle or best-view score is inferred.',
                          'Viewpoints are approximate regions, not surveyed or verified accessible camera locations.']}
    (ROOT/'data'/'observations.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'data'/'observations.js').write_text('window.CLOUD_ATLAS_DATA = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
    print(json.dumps({'days':[{k:d[k] for k in ['date','validPairs','minDelta','maxDelta']} for d in days],
                      'stationRecords':sum(len(r) for r in records),'example':days[2]['frames'][12]},ensure_ascii=False,indent=2))

if __name__=='__main__': build()
