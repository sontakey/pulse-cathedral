"""Prepare subject 1 using second Empatica tag and documented video marker (307).
No fitting to predicted pulse. Preserve sparse IBI intervals individually.
"""
from pathlib import Path
import json,numpy as np
p=Path('benchmarks/artifacts/kaggle-subject1');ts=json.loads((p/'timestamps.json').read_text())
b=np.loadtxt(p/'BVP.csv');hr=np.loadtxt(p/'HR.csv');tags=np.loadtxt(p/'tags.csv');ibi=np.loadtxt(p/'IBI.csv',delimiter=',',skiprows=1)
markerFrame=307;videoMarker=ts[markerFrame];offset=videoMarker-(tags[1]-b[0]);rt=np.arange(len(b)-2)/b[1]+offset
hrt=np.arange(len(hr)-2)/hr[1]+hr[0]-b[0]+offset;hrv=np.interp(rt,hrt,hr[2:])
np.savetxt(p/'reference.csv',np.column_stack([np.arange(len(rt)),rt,b[2:],hrv]),delimiter=',',header='Count,Time,PPG,HR',comments='')
intervals=[{'start':float(t-d+offset),'t':float(t+offset),'ibiMs':float(d*1000)} for t,d in ibi if tags[1]-b[0]<=t-d and t<=tags[2]-b[0]]
(p/'reference-intervals.json').write_text(json.dumps(intervals,indent=2))
meta={'dataset':'Kaggle rPPG / subject 1','referenceHz':float(b[1]),'source':'https://www.kaggle.com/datasets/ashfakyeafi/rppg-dataset/data','alignment':{'tagIndexZeroBased':1,'videoFrameZeroBased':markerFrame,'videoMarkerSeconds':videoMarker,'referenceToVideoOffsetSeconds':float(offset),'expectedEndMarkerVideoSeconds':float(videoMarker+tags[2]-tags[1]),'method':'Fixed offset from recording notes plus visible start marker; no signal-fitted alignment or drift correction'},'limitations':['One development recording; not held-out or multi-subject accuracy.','Reference is Empatica wrist PPG and device-derived IBI, not ECG.','Second-to-third tag mapping follows prose and recording duration; example code in track.txt conflicts.','Marker frame indexing and start/end light timing limit absolute beat alignment precision.','Sparse reference IBIs retain gaps; no interval concatenation or imputation.','HR comparison uses device-smoothed HR; baselines offline, production streaming.','Video downscaled to 640x360 for browser extraction; synchronous 10 Hz landmarks do not reproduce live scheduling.','Kaggle lists an unknown license; training/redistribution permissions are unverified.']}
(p/'dataset.json').write_text(json.dumps(meta,indent=2));print(meta['alignment'])
