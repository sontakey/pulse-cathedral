"""Development benchmark. Reference timing/beat labels are not independently certified.
Run with artifacts/venv/bin/python. Actual pinned Toolbox POS/CHROM source is loaded.
The sole NumPy compatibility shim restores np.mat as np.asmatrix.
"""
import ast, csv, importlib.util, json, sys, types
from pathlib import Path
import numpy as np
from scipy import signal, sparse, linalg
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
base=Path(sys.argv[1]); session=json.loads((base/(sys.argv[2] if len(sys.argv)>2 else 'first120.json')).read_text());stream=json.loads((base/(sys.argv[3] if len(sys.argv)>3 else 'stream.json')).read_text())
upstream=Path('benchmarks/artifacts/toolbox-reference');sys.path.insert(0,str(upstream));np.mat=np.asmatrix
# Load original utils functions without its two unused optional ML/image dependencies.
source=ast.parse((upstream/'unsupervised_methods/utils.py').read_text());source.body=[n for n in source.body if isinstance(n,ast.FunctionDef)]
utils=types.ModuleType('unsupervised_methods.utils');utils.__dict__.update(np=np,sparse=sparse,linalg=linalg);exec(compile(source,'upstream-utils','exec'),utils.__dict__);sys.modules[utils.__name__]=utils
from unsupervised_methods.methods.POS_WANG import POS_WANG
from unsupervised_methods.methods.CHROME_DEHAAN import CHROME_DEHAAN
frames=session['frames'];t=np.array([f['t'] for f in frames]);fs=1/np.median(np.diff(t))
valid=np.array([f['rgb'] is not None for f in frames]);rgb=np.array([f['rgb'] or [np.nan]*3 for f in frames]);
for c in range(3):rgb[:,c]=np.interp(t,t[valid],rgb[valid,c])
metadata=json.loads((base/'dataset.json').read_text()) if (base/'dataset.json').exists() else {}
refFs=metadata.get('referenceHz',60)
reference=np.genfromtxt(base/'reference.csv',delimiter=',',names=True);rt=reference['Time'] if 'Time' in reference.dtype.names else reference['Count']/refFs
ref=reference['PPG'];refhr=reference['HR'];duration=t[-1]-t[0]
print('running pinned Toolbox methods',flush=True)
signals={'Toolbox POS':POS_WANG(rgb[:,None,None,:],fs),'Toolbox CHROM':CHROME_DEHAAN(rgb[:,None,None,:],fs)}
sos=signal.butter(2,[.7,4],fs=fs,btype='bandpass',output='sos');signals['Green + bandpass']=signal.sosfiltfilt(sos,rgb[:,1])
if all('wideRGB' in f for f in frames if f['rgb'] is not None):
 wide=np.array([f.get('wideRGB') or [np.nan]*3 for f in frames]);good=np.all(np.isfinite(wide),axis=1)
 for c in range(3):wide[:,c]=np.interp(t,t[good],wide[good,c])
 signals['Wide mask Toolbox POS']=POS_WANG(wide[:,None,None,:],fs)
# Classical outputs are offline zero-phase estimates, not causal streaming replacements.
def bpm(x,rate):
 if len(x)<rate*3 or np.std(x)<1e-8:return None
 f,p=signal.periodogram(x,rate,window='hann',nfft=16384);mask=(f>=.7)&(f<=3)
 return float(f[mask][np.argmax(p[mask])]*60)
def metrics(errors):
 return {'windows':len(errors),'maeBpm':float(np.mean(np.abs(errors))) if errors else None,'biasBpm':float(np.mean(errors)) if errors else None}
results={};windows=[]
for name,x in signals.items():
 errors=[]
 for start in np.arange(t[0]+8,t[-1]-11,4):
  end=start+8;ix=(t[:len(x)]>=start)&(t[:len(x)]<end);ri=(rt>=start)&(rt<end)
  if not np.any(ri):continue
  pred=bpm(x[ix],fs);truth=float(np.median(refhr[ri]));referenceSpectral=bpm(ref[ri],refFs)
  windows.append({'method':name,'start':float(start),'end':float(end),'hr':pred,'deviceHR':truth,'referencePPGHR':referenceSpectral})
  if pred is not None:errors.append(pred-truth)
 results[name]=metrics(errors)
for name,run in stream.items():
 errors=[];eligible=[d for d in run['readouts'] if d['timestamp']>=t[0]+8]
 for d in eligible:
  if d['hr'] is None:continue
  w=d['hrWindow'];ix=(rt>=w['start'])&(rt<=w['end']);truth=float(np.median(refhr[ix]));errors.append(d['hr']-truth)
 results[name]={**metrics(errors),'eligibleReadouts':len(eligible),'acceptedReadoutFraction':sum(d['hr'] is not None for d in eligible)/max(1,len(eligible)),'validBeats':sum(b['valid'] for b in run['beats'])}
# Reference peak picking is exploratory only: inspect waveform before admitting IBI ground truth.
rsel=(rt>=t[0])&(rt<=t[-1]);rwave=signal.sosfiltfilt(signal.butter(2,[.7,4],fs=refFs,btype='bandpass',output='sos'),ref[rsel]);peaks,_=signal.find_peaks(rwave,distance=refFs*.3,prominence=np.std(rwave)*.4)
referencePeaks=rt[rsel][peaks];referenceIntervals=np.diff(referencePeaks)*1000
report={'dataset':'MPU-rPPG Figshare sample','videoFileId':55553417,'referenceFileId':55553414,'durationSeconds':float(duration),'extractionFps':float(fs),'results':results,'windows':windows,'referenceAudit':{'rows':len(reference),'videoFrames':session['settings']['frames'],'countContinuous':bool(np.all(np.diff(reference['Count'])==1)),'initialPPG':ref[:10].tolist(),'referenceIntervalP5P50P95Ms':np.percentile(referenceIntervals,[5,50,95]).tolist()},'limitations':['One development clip, not held-out accuracy.','Pairing inferred from adjacent official file IDs and exact matching row/frame counts.','Clock inferred from frame/count at 60 Hz; no raw timestamps or independent alignment evidence in sample CSV.','HR errors compare device-smoothed HR, not ECG instantaneous HR.','Offline baselines use whole clip with zero-phase filtering; streaming runs preserve production gates and resets.','Landmark updates synchronous at 10 Hz, unlike asynchronous live capture.','IBI and HRV accuracy withheld pending reference audit and independent beat annotations.'],'toolbox':json.loads((upstream/'provenance.json').read_text())}
if metadata:
 report.update({k:v for k,v in metadata.items() if k not in ['referenceHz']});report.pop('videoFileId',None);report.pop('referenceFileId',None)
report['timingAudit']=json.loads((base/'timing-audit.json').read_text()) if (base/'timing-audit.json').exists() else None
(base/'comparison.json').write_text(json.dumps(report,indent=2))
# Save complete numeric waveforms for independently inspectable analysis.
(base/'waveforms.json').write_text(json.dumps({'t':t.tolist(),'referenceT':rt[rsel].tolist(),'referencePPG':ref[rsel].tolist(),'signals':{n:x.tolist() for n,x in signals.items()},'referencePeaksExploratory':referencePeaks.tolist()}))
fig,axes=plt.subplots(6,1,figsize=(14,14));fig.suptitle(report['dataset']+' — development comparison',fontsize=15)
for name in signals:
 w=[x for x in windows if x['method']==name];axes[0].plot([x['start']+4 for x in w],[x['hr'] for x in w],label=name)
axes[0].plot(rt[rsel],refhr[rsel],color='black',label='Device HR reference');axes[0].set(ylabel='bpm',xlim=(t[0],t[-1]));axes[0].legend(ncol=2,fontsize=8)
run=stream['production'];axes[1].plot([d['timestamp'] for d in run['readouts']],[d['quality'] for d in run['readouts']],label='Production quality');axes[1].axhline(.55,ls='--',color='red',label='Acceptance threshold');axes[1].set(ylabel='Quality',ylim=(0,1));axes[1].legend(fontsize=8)
# Fixed a priori display window; separately normalized, no phase shift or time warping.
showStart=t[0]+40;showEnd=showStart+10
for ax,(name,x) in zip(axes[2:5],signals.items()):
 ix=(t[:len(x)]>=showStart)&(t[:len(x)]<=showEnd);ri=(rt>=showStart)&(rt<=showEnd)
 def z(v):return (v-np.mean(v))/max(np.std(v),1e-12)
 ax.plot(rt[ri],z(ref[ri]),color='black',alpha=.45,label='Raw contact PPG');ax.plot(t[:len(x)][ix],z(x[ix]),label=name);ax.set(ylabel='SD units');ax.legend(fontsize=8)
w=run['waveform'];wt=np.array([p['t'] for p in w]);wv=np.array([p['value'] for p in w]);ix=(wt>=showStart)&(wt<=showEnd)
axes[5].plot(wt[ix],wv[ix],label='Production committed waveform');
if not np.any(ix):axes[5].text(.5,.5,'No committed waveform in this window: capture resets / warmup',ha='center',transform=axes[5].transAxes)
axes[5].legend(fontsize=8);axes[5].set(xlabel='Seconds',ylabel='Amplitude',xlim=(showStart,showEnd))
fig.text(.02,.005,'Reference uses documented clock mapping only. Baselines are offline; production is streaming. No waveform-fitted time warping.',fontsize=10)
fig.tight_layout(rect=(0,.025,1,.97));fig.savefig(base/'comparison.png',dpi=150);print(json.dumps(results,indent=2),flush=True)
