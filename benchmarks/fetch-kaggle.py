"""Download subject 1 only. Preserve source hashes, safely unwrap single-file ZIP responses."""
import hashlib,io,json,urllib.parse,urllib.request,zipfile
from pathlib import Path
p=Path('benchmarks/artifacts/kaggle-subject1');p.mkdir(parents=True,exist_ok=True)
root='subject_001/subject_001/trial_001/'
files=['empatica_e4/'+n for n in ['info.txt','track.txt','tags.csv','BVP.csv','HR.csv','IBI.csv']]+['video/video.MOV']
for name in files:
 dst=p/name.split('/')[-1]
 if not dst.exists():
  u='https://www.kaggle.com/api/v1/datasets/download/ashfakyeafi/rppg-dataset/'+urllib.parse.quote(root+name,safe='')
  tmp=dst.with_suffix(dst.suffix+'.partial')
  with urllib.request.urlopen(u,timeout=60) as r,tmp.open('wb') as f:
   while b:=r.read(1048576):f.write(b)
  if zipfile.is_zipfile(tmp):
   with zipfile.ZipFile(tmp) as z:
    assert len(z.namelist())==1,'Unexpected archive contents'
    dst.write_bytes(z.read(z.namelist()[0]))
   tmp.unlink()
  else:tmp.replace(dst)
 print(dst.name,dst.stat().st_size)
(p/'checksums.json').write_text(json.dumps({f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in p.iterdir() if f.name in [n.split('/')[-1] for n in files]},indent=2))
