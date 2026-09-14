"""Score accepted and diagnostic-only candidate readouts on their actual HR windows."""
import json
from pathlib import Path
import numpy as np
from scipy import signal

BASE=Path(__file__).resolve().parent/'artifacts/control'
results=[]
for subject in ['subject1','subject3','subject4']:
    folder=BASE/subject
    stages=json.loads((folder/'stages.json').read_text())
    waves=json.loads((folder/'waves.json').read_text())
    session=json.loads((folder/'session.json').read_text())
    t=np.array(waves['referenceTime']);ppg=np.array(waves['referencePPG']);device=np.array(waves['deviceHR'])
    ut,ui=np.unique(t,return_index=True)
    modes={}
    for mode,run in stages['runs'].items():
        rows=[]
        for reading in run['readouts']:
            window=reading.get('hrWindow')
            candidate=(reading.get('diagnostics') or {}).get('candidateHr')
            if not window or candidate is None:continue
            start,end=window['start'],window['end']
            if end-start<2:continue
            grid=np.arange(start,end,1/30)
            x=np.interp(grid,ut,ppg[ui])
            f,p=signal.periodogram(x,30,window='hann',nfft=16384)
            mask=(f>=.7)&(f<=3)
            contact=float(f[mask][p[mask].argmax()]*60)
            ref=(t>=start)&(t<=end)
            if not ref.any():continue
            dh=float(np.median(device[ref]))
            rows.append(dict(t=reading['timestamp'],start=start,end=end,accepted=reading['hr'] is not None,
                             candidateHR=candidate,deviceHR=dh,contactPPGHR=contact,
                             candidateErrorVsDevice=abs(candidate-dh),candidateErrorVsContact=abs(candidate-contact)))
        def metric(accepted_only):
            selected=[r for r in rows if not accepted_only or r['accepted']]
            return dict(count=len(selected),maeVsDevice=float(np.mean([r['candidateErrorVsDevice'] for r in selected])) if selected else None,
                        maeVsContact=float(np.mean([r['candidateErrorVsContact'] for r in selected])) if selected else None)
        modes[mode]=dict(availability=run['availability'],availableSeconds=run['availableSeconds'],eligibleSeconds=run['eligibleSeconds'],
                        accepted=metric(True),allDiagnosticCandidates=metric(False),rows=rows)
    frames=session['frames']
    captureReasons={}
    for f in frames:
        if f.get('invalidReason'):captureReasons[f['invalidReason']]=captureReasons.get(f['invalidReason'],0)+1
    result=dict(subject=subject,modes=modes,captureReasons=captureReasons,
                gapEvents=sum(b['t']-a['t']>.15 for a,b in zip(frames,frames[1:])),
                note='Diagnostic ablations share original capture gates. Wider mask changes RGB region and removes agreement. Accuracy/availability are not independently validated deployment thresholds.')
    (folder/'stage-scores.json').write_text(json.dumps(result,indent=2,allow_nan=False))
    results.append(result)
(BASE/'stage-scores.json').write_text(json.dumps(results,indent=2,allow_nan=False))
print(json.dumps([{**r,'modes':{k:{p:v for p,v in m.items() if p!='rows'} for k,m in r['modes'].items()}} for r in results],indent=2))
