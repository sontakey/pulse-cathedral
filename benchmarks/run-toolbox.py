"""Run original Toolbox preprocessing, classical methods and pretrained TS-CAN.
Only dataset/host adapter: lazy RGB decode, marker-aligned reference, CPU checkpoint loading.
Upstream implementation files remain unmodified.
"""
import os,sys,json,hashlib,importlib.util,subprocess,time
from pathlib import Path
import numpy as np,cv2,torch,yaml
from yacs.config import CfgNode
root=Path(__file__).resolve().parents[1];up=root/'benchmarks/artifacts/rPPG-Toolbox';base=root/'benchmarks/artifacts/kaggle-subject1';out=base/'toolbox';out.mkdir(exist_ok=True)
sys.path.insert(0,str(up));os.chdir(up)
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,up/path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
BaseLoader=load('upstream_base','dataset/data_loader/BaseLoader.py').BaseLoader
from neural_methods.model.TS_CAN import TSCAN
from unsupervised_methods.methods.POS_WANG import POS_WANG
from unsupervised_methods.methods.CHROME_DEHAAN import CHROME_DEHAAN
from unsupervised_methods.methods.GREEN import GREEN
from evaluation.post_process import _detrend,calculate_metric_per_video
from scipy import signal
config=yaml.safe_load((up/'configs/infer_configs/PURE_UBFC-rPPG_TSCAN_BASIC.yaml').read_text());cfg=CfgNode(config['TEST']['DATA']['PREPROCESS'])
session=json.loads((base/'first120-wide.json').read_text());t=np.array([f['t'] for f in session['frames']]);fps=30000/1001;start=round(t[0]*fps)
class Video:
 def __init__(self):
  self.cap=cv2.VideoCapture(str(base/'video.MOV'));self.shape=(len(t),1080,1920,3);self.last=-1;self.cache=None
 def __getitem__(self,i):
  if i==self.last:return self.cache
  target=start+i;at=int(self.cap.get(cv2.CAP_PROP_POS_FRAMES))
  if at!=target:self.cap.set(cv2.CAP_PROP_POS_FRAMES,target)
  ok,bgr=self.cap.read();assert ok,'Missing source video frame'
  self.last=i;self.cache=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)
  if i%600==0:print('decode',i,flush=True)
  return self.cache
class Probe(BaseLoader):
 def face_detection(self,*args,**kwargs):
  box=super().face_detection(*args,**kwargs);self.boxes.append(np.asarray(box).tolist());return box
 def crop_face_resize(self,*args,**kwargs):
  x=super().crop_face_resize(*args,**kwargs);self.cropped=x;return x
loader=Probe.__new__(Probe);loader.boxes=[]
r=np.genfromtxt(base/'reference.csv',delimiter=',',names=True);labels=np.interp(t,r['Time'],r['PPG'])
print('upstream preprocess',flush=True);beg=time.time();clips,labelclips=loader.preprocess(Video(),labels,cfg)
print('preprocess complete',clips.shape,loader.boxes,flush=True)
np.save(out/'crop-rgb.npy',loader.cropped.mean(axis=(1,2)));cv2.imwrite(str(out/'first-crop.png'),cv2.cvtColor(loader.cropped[0].astype(np.uint8),cv2.COLOR_RGB2BGR))
# Save small reference fixture for future browser preprocessing parity checks.
np.savez(out/'preprocess-fixture.npz',crop=loader.cropped[:20],transformed=clips[0,:20])
print('classical inference',flush=True)
waves={'Toolbox full crop POS':POS_WANG(loader.cropped,fps),'Toolbox full crop CHROM':CHROME_DEHAAN(loader.cropped,fps)}
b,a=signal.butter(1,[.6/fps*2,3.3/fps*2],btype='bandpass');waves['Toolbox full crop GREEN']=signal.filtfilt(b,a,_detrend(GREEN(loader.cropped),100))
weight=up/config['INFERENCE']['MODEL_PATH'];model=TSCAN(frame_depth=config['MODEL']['TSCAN']['FRAME_DEPTH'],img_size=cfg.RESIZE.H)
state=torch.load(weight,map_location='cpu',weights_only=True);state={k.removeprefix('module.'):v for k,v in state.items()};model.load_state_dict(state,strict=True)
device='mps' if torch.backends.mps.is_available() else 'cpu';model=model.to(device).eval();pred=[]
with torch.inference_mode():
 for i in range(0,len(clips),config['INFERENCE']['BATCH_SIZE']):
  batch=np.ascontiguousarray(clips[i:i+config['INFERENCE']['BATCH_SIZE']].transpose(0,1,4,2,3));batch=torch.from_numpy(batch).float().flatten(0,1).to(device)
  pred.append(model(batch).flatten().cpu().numpy());print('neural chunks',min(i+4,len(clips)),'/',len(clips),flush=True)
pred=np.concatenate(pred);np.save(out/'tscan-difference.npy',pred)
# Same integration, detrend and filter used by upstream calculate_metric_per_video.
b,a=signal.butter(1,[.6/fps*2,3.3/fps*2],btype='bandpass');waves['Toolbox pretrained TS-CAN']=signal.filtfilt(b,a,_detrend(np.cumsum(pred),100))
np.savez(out/'outputs.npz',t=t,reference=labels,**waves)
# Match every method on identical 8-second windows, restricted to the model's retained tail.
commonEnd=t[len(pred)-1];rows=[];metrics={}
def hr(x):
 f,p=signal.periodogram(x,fps,window='hann',nfft=16384);m=(f>=.7)&(f<=3);return float(f[m][p[m].argmax()]*60)
prior=json.loads((base/'waveforms.json').read_text());allwaves={**{('Our regions + '+k):np.array(v) for k,v in prior['signals'].items() if k in ['Toolbox POS','Toolbox CHROM','Green + bandpass']},**waves}
for name,x in allwaves.items():
 errors=[]
 for begin in np.arange(t[0]+8,commonEnd-8,4):
  end=begin+8;ix=(t[:len(x)]>=begin)&(t[:len(x)]<end);ri=(r['Time']>=begin)&(r['Time']<end);truth=float(np.median(r['HR'][ri]));h=hr(x[ix]);errors.append(h-truth);rows.append({'method':name,'start':float(begin),'end':float(end),'hr':h,'deviceHR':truth})
 metrics[name]={'windows':len(errors),'maeBpm':float(np.mean(np.abs(errors))),'biasBpm':float(np.mean(errors)),'gating':'none; all planned common windows'}
# Upstream full-record scoring against waveform reference (distinct protocol, not device HR).
print('upstream metric evaluation',flush=True);gth,ph,snr,macc=calculate_metric_per_video(pred,BaseLoader.diff_normalize_label(labels)[:len(pred)],fs=fps,diff_flag=True)
report={'dataset':'Kaggle subject 1 / complete Toolbox path','upstreamCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'config':config,'checkpoint':str(weight.relative_to(up)),'checkpointSHA256':hashlib.sha256(weight.read_bytes()).hexdigest(),'faceBoxes':loader.boxes,'device':device,'elapsedSeconds':time.time()-beg,'decodedFrames':len(t),'retainedNeuralFrames':len(pred),'commonWindowEnd':float(commonEnd),'results':metrics,'windows':rows,'upstreamFullClipMetric':{'referencePPGHR':float(gth),'predictedHR':float(ph),'snrDb':float(snr),'macc':float(macc),'note':'Upstream MACC searches all circular lags; it is not beat alignment or IBI validation.'},'limitations':['One development clip; not held-out subject accuracy.','Unmodified upstream preprocessing/method/model functions with a lazy custom dataset adapter; CUDA DataParallel wrapper omitted on Mac.','Uses published static HC crop, 1.5 expansion, 72x72, difference+appearance normalization, 180-frame chunks, PURE_TSCAN checkpoint.','Whole-clip normalization/filtering is offline; browser streaming parity not established.','HR reference is device-smoothed wrist PPG HR; clock discrepancy and IBI reference gaps remain.','Frame rate metadata override is actual 29.97003 rather than nominal config 30.','No training, no production deployment.']}
(out/'results.json').write_text(json.dumps(report,indent=2));print(json.dumps(metrics,indent=2),flush=True)
