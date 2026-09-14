"""Positive-control candidate: original UBFC reader, preprocessing and PURE TS-CAN.

Uses complete recordings 1/3/4 selected before inference. No tuning or gate changes.
"""
import gc
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import types

import cv2
import numpy as np
from scipy import signal
import torch
import yaml
from yacs.config import CfgNode

ROOT = Path(__file__).resolve().parents[1]
UP = ROOT / 'benchmarks/artifacts/rPPG-Toolbox'
OUT = ROOT / 'benchmarks/artifacts/control'
SOURCE = Path('/Volumes/AcasisData/rPPG-datasets/ubfc-control')
OUT.mkdir(exist_ok=True)
sys.path.insert(0, str(UP))
os.chdir(UP)
# Load only the original UBFC reader; avoid eagerly importing unrelated dataset dependencies.
for name, path in [('dataset', UP/'dataset'), ('dataset.data_loader', UP/'dataset/data_loader')]:
    package = types.ModuleType(name)
    package.__path__ = [str(path)]
    sys.modules[name] = package
from dataset.data_loader.UBFCrPPGLoader import UBFCrPPGLoader
from dataset.data_loader.BaseLoader import BaseLoader
from neural_methods.model.TS_CAN import TSCAN
from unsupervised_methods.methods.POS_WANG import POS_WANG
from unsupervised_methods.methods.CHROME_DEHAAN import CHROME_DEHAAN
from unsupervised_methods.methods.GREEN import GREEN
from evaluation.post_process import _detrend, calculate_metric_per_video

config = yaml.safe_load((UP/'configs/infer_configs/PURE_UBFC-rPPG_TSCAN_BASIC.yaml').read_text())
cfg = CfgNode(config['TEST']['DATA']['PREPROCESS'])
checkpoint = UP / config['INFERENCE']['MODEL_PATH']
device = 'mps' if torch.backends.mps.is_available() else 'cpu'
model = TSCAN(frame_depth=10, img_size=72)
state = torch.load(checkpoint, map_location='cpu', weights_only=True)
model.load_state_dict({k.removeprefix('module.'): v for k,v in state.items()}, strict=True)
model = model.to(device).eval()
protocol = dict(subjects=[1,3,4], selection='Complete recordings, fixed before inference',
                upstreamCommit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
                checkpointSHA256=hashlib.sha256(checkpoint.read_bytes()).hexdigest(), config=config,
                sourceProvenance=json.loads((SOURCE/'provenance.json').read_text()),
                primary='Unmodified upstream full-record evaluation against supplied waveform at nominal 30 Hz, after retaining complete 180-frame chunks.',
                diagnostic='8/15/30 s windows, 4 s step, 8 s edge exclusion, waveform resampled on supplied reference timestamps. Compare with median device HR.',
                limitations=['Public mirror video; official reference byte match and mirror video SHA verified; no original-author video checksum.',
                             'Three controls do not establish population accuracy or independent performance on the full dataset.',
                             'Upstream nominal frame clock and supplied acquisition timestamp clock are reported separately.',
                             'Offline normalization and zero-phase filters; not browser streaming parity.',
                             'No IBI/HRV validity, training or deployment.'])
(OUT/'protocol.json').write_text(json.dumps(protocol,indent=2))

class Probe(UBFCrPPGLoader):
    def face_detection(self,*args,**kwargs):
        box=super().face_detection(*args,**kwargs)
        self.boxes.append(np.asarray(box).tolist())
        return box
    def crop_face_resize(self,*args,**kwargs):
        self.cropped=super().crop_face_resize(*args,**kwargs)
        return self.cropped

def spectral_hr(x,fs=30):
    if not np.all(np.isfinite(x)) or np.std(x)<1e-12:return None
    f,p=signal.periodogram(x,fs,window='hann',nfft=16384)
    m=(f>=.7)&(f<=3)
    return float(f[m][np.argmax(p[m])]*60)

def error_mean(scores,method,seconds):
    errors=[abs(r['hr']-r['deviceHR']) for r in scores if r['method']==method and r['windowSeconds']==seconds and r['hr'] is not None]
    return float(np.mean(errors)) if errors else None

summary=[]
for subject in protocol['subjects']:
    name=f'subject{subject}'
    source=SOURCE/name
    out=OUT/name
    out.mkdir(exist_ok=True)
    if (out/'toolbox.json').exists() and (out/'waves.json').exists() and (out/'toolbox-raw.npz').exists():
        summary.append(json.loads((out/'toolbox.json').read_text()))
        print('REUSE completed frozen control',name,flush=True)
        continue
    print('READ ORIGINAL UBFC',name,flush=True)
    frames=UBFCrPPGLoader.read_video(str(source/'vid.avi'))
    labels=UBFCrPPGLoader.read_wave(str(source/'ground_truth.txt'))
    gt=np.loadtxt(source/'ground_truth.txt')
    assert len(frames)==len(labels)==gt.shape[1]
    t=gt[2]-gt[2,0]
    assert np.all(np.isfinite(gt)) and np.all(np.diff(t)>=0)
    meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries',
                                            'stream=width,height,codec_name,pix_fmt,r_frame_rate,nb_frames:format=duration','-of','json',str(source/'vid.avi')]))
    pts=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries',
                                           'frame=best_effort_timestamp_time','-of','json',str(source/'vid.avi')]))
    pts=np.array([float(f['best_effort_timestamp_time']) for f in pts['frames']])
    assert len(pts)==len(t) and np.all(np.diff(pts)>0)
    (out/'timestamps.json').write_text(json.dumps(t.tolist()))
    (out/'container-timestamps.json').write_text(json.dumps(pts.tolist()))
    loader=Probe.__new__(Probe)
    loader.boxes=[]
    print('PREPROCESS',frames.shape,flush=True)
    clips,labelclips=loader.preprocess(frames,labels,cfg)
    del frames
    retained=len(clips)*cfg.CHUNK_LENGTH
    assert retained>900
    b,a=signal.butter(1,[.6/30*2,3.3/30*2],btype='bandpass')
    waves={'Toolbox POS':POS_WANG(loader.cropped,30),
           'Toolbox CHROM':CHROME_DEHAAN(loader.cropped,30),
           'Toolbox GREEN':signal.filtfilt(b,a,_detrend(GREEN(loader.cropped),100))}
    outputs=[]
    with torch.inference_mode():
        for i in range(0,len(clips),4):
            x=torch.from_numpy(np.ascontiguousarray(clips[i:i+4].transpose(0,1,4,2,3))).float().flatten(0,1).to(device)
            outputs.append(model(x).flatten().cpu().numpy())
            del x
    pred=np.concatenate(outputs)
    waves['Toolbox TS-CAN']=signal.filtfilt(b,a,_detrend(np.cumsum(pred),100))
    gth,ph,snr,macc=calculate_metric_per_video(pred,labelclips.reshape(-1),fs=30,diff_flag=True)
    original=dict(referenceWaveformHR=float(gth),predictedHR=float(ph),absoluteErrorBpm=float(abs(gth-ph)),
                  snrDb=float(snr),macc=float(macc),note='MACC searches circular lags, not beat matching.')
    # Same retained duration for every diagnostic method. Never evaluate padded neural tail.
    grids=np.arange(t[0],t[retained-1],1/30)
    # Preserve original timestamps in replay. For offline plotting/scoring only,
    # keep the first sample at a duplicate timestamp; never fabricate a later time.
    unique_t, unique_i=np.unique(t[:retained],return_index=True)
    uniform={k:np.interp(grids,unique_t,v[unique_i]) for k,v in waves.items()}
    uniform['Reference PPG']=np.interp(grids,unique_t,labels[unique_i])
    scores=[]
    for seconds in [8,15,30]:
        for begin in np.arange(8,grids[-1]-8-seconds+1e-9,4):
            mask=(grids>=begin)&(grids<begin+seconds)
            ref=(t>=begin)&(t<begin+seconds)
            truth=float(np.median(gt[1,ref]))
            for method,x in uniform.items():
                scores.append(dict(method=method,windowSeconds=seconds,start=float(begin),end=float(begin+seconds),
                                   hr=spectral_hr(x[mask]),deviceHR=truth))
    result=dict(subject=name,sourceMetadata=meta,frames=len(t),retainedFrames=retained,
                acquisitionDuration=float(t[-1]),containerDuration=float(pts[-1]),
                acquisitionMedianDt=float(np.median(np.diff(t))),acquisitionMaxDt=float(max(np.diff(t))),
                duplicateReferenceTimestamps=int(sum(np.diff(t)==0)),longReferenceGaps=int(sum(np.diff(t)>.15)),
                acquisitionMeanFps=float((len(t)-1)/t[-1]),faceBoxes=loader.boxes,
                officialMetric=original,device=device,scores=scores,
                meanErrors={str(s):{m:error_mean(scores,m,s) for m in uniform} for s in [8,15,30]})
    (out/'toolbox.json').write_text(json.dumps(result,indent=2,allow_nan=False))
    (out/'waves.json').write_text(json.dumps(dict(t=grids.tolist(),signals={k:v.tolist() for k,v in uniform.items()},
                                                referenceTime=t.tolist(),deviceHR=gt[1].tolist(),referencePPG=labels.tolist()),allow_nan=False))
    np.savez_compressed(out/'toolbox-raw.npz',t=t,reference=labels,predictedDifference=pred,cropRGB=loader.cropped.mean(axis=(1,2)),**waves)
    cv2.imwrite(str(out/'crop-check.png'),cv2.cvtColor(np.concatenate([loader.cropped[i].astype(np.uint8) for i in [0,len(t)//2,len(t)-1]],axis=1),cv2.COLOR_RGB2BGR))
    summary.append(result)
    (OUT/'results.json').write_text(json.dumps(summary,indent=2,allow_nan=False))
    print(name,original,result['meanErrors'],flush=True)
    del loader,clips,labelclips,pred,waves,uniform,outputs
    gc.collect()
    if device=='mps':torch.mps.empty_cache()
print('CONTROL COMPLETE',flush=True)
