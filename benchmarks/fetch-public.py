"""Fetch official public development sample, verify checksums, pin baseline source."""
import hashlib,json,urllib.request
from pathlib import Path
m=json.loads(Path('benchmarks/public-data-manifest.json').read_text());root=Path('benchmarks/artifacts/mpu-sample');root.mkdir(parents=True,exist_ok=True)
for item in m['files']:
 p=root/item['name']
 if not p.exists() or hashlib.md5(p.read_bytes()).hexdigest()!=item['md5']:
  tmp=p.with_suffix(p.suffix+'.partial')
  with urllib.request.urlopen('https://ndownloader.figshare.com/files/'+str(item['id']),timeout=60) as r, tmp.open('wb') as f:
   while chunk:=r.read(1024*1024):f.write(chunk)
  assert tmp.stat().st_size==item['bytes'] and hashlib.md5(tmp.read_bytes()).hexdigest()==item['md5'],'Download checksum mismatch'
  tmp.replace(p)
 print('verified',p)
root=Path('benchmarks/artifacts/toolbox-reference');root.mkdir(parents=True,exist_ok=True)
for name in ['unsupervised_methods/methods/POS_WANG.py','unsupervised_methods/methods/CHROME_DEHAAN.py','unsupervised_methods/methods/GREEN.py','unsupervised_methods/utils.py','LICENSE']:
 p=root/name;p.parent.mkdir(parents=True,exist_ok=True)
 p.write_bytes(urllib.request.urlopen('https://raw.githubusercontent.com/ubicomplab/rPPG-Toolbox/'+m['toolboxCommit']+'/'+name).read())
(root/'provenance.json').write_text(json.dumps({'repository':'https://github.com/ubicomplab/rPPG-Toolbox','commit':m['toolboxCommit']},indent=2))
