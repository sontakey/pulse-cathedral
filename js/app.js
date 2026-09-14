import { RPPGProcessor, CONFIG } from './measurement.js';
import { FaceDetector } from './rppg.js';
import { sampleFacePixels } from './capture-sample.js';
import { drawTrace } from './trace.js';
import { makeSynthetic } from './synthetic.js';
import { SessionRecorder } from './recording.js';
import { Diagnostics } from './diagnostics.js';
import { CaptureFeedback } from './capture-feedback.js';

const $=id=>document.getElementById(id);
const processor=new RPPGProcessor(),recorder=new SessionRecorder(),face=new FaceDetector();
const diagnostics=new Diagnostics(),captureFeedback=new CaptureFeedback();
let lastFeedbackAt=-Infinity;
const browserInfo={browser:navigator.userAgent,platform:navigator.platform,secureContext:isSecureContext,videoFrameCallback:'requestVideoFrameCallback' in HTMLVideoElement.prototype,appVersion:'signal-lab-capture-feedback-v2'};
diagnostics.start('none',browserInfo,CONFIG);
let pendingDiagnosticReset=false;
const video=$('webcam'),canvas=$('face-canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
const detectorCanvas=document.createElement('canvas');
let source=null,stream=null,callback=null,timer=null,generation=0,busy=false,lastMedia=-1,lastTime=0,lastDetect=-Infinity,detectedAt=-Infinity;
let previousLandmarks=null,motion=0,previousBrightness=null,settings={},scene=null,sceneLoading=false,frozen=null,synthetic=null;

function display(data=processor.result){
  for(const [id,value,digits] of [['hr',data.hr,1],['ibi',data.ibi,1],['rmssd',data.hrv,1],['sdnn',data.sdnn,1],['quality',data.quality*100,0],['coverage',data.coverage*100,0]]){
    $(id+'-value').textContent=Number.isFinite(value)?value.toFixed(digits):'—';
  }
  $('status-message').textContent=data.reason;
  $('status-dot').classList.toggle('good',data.hr!==null);
  $('fps-label').textContent=data.fps?data.fps.toFixed(1)+' fps':'— fps';
  $('agreement-label').textContent=`Region agreement: ${data.agreement===null?'—':Math.round(data.agreement*100)+'%'} · frame timing: ${settings.timing||'—'}`;
  $('trace-delay').textContent=data.latency?`${(data.latency/1000).toFixed(2)} s last beat confirmation`:'~2 s confirmation delay';
  $('trace-empty').style.display=processor.waveform.length?'none':'flex';
  $('trace-signal-label').textContent=data.hr===null?'Unverified signal · may contain artifacts':'Extracted pulse';
  if(!processor.waveform.length)$('trace-empty').innerHTML=source?'Collecting the pulse waveform.<small>Keep still in steady light for 8 seconds.</small>':'Start the camera or try a synthetic signal.<small>No measurement is running.</small>';
  if(!$('freeze').checked)frozen=null;
  else if(!frozen)frozen={wave:processor.waveform.map(p=>({...p})),beats:processor.beats.map(b=>({...b})),accepted:data.hr!==null};
  drawTrace($('ppg-trace'),frozen?.wave||processor.waveform,frozen?.beats||processor.beats,{scale:$('trace-scale').value,accepted:frozen?frozen.accepted:data.hr!==null});
  const frames=recorder.data?.frames||[];
  $('record-state').textContent=recorder.active?`Recording · ${(frames.at(-1)?.t||0).toFixed(0)} s`:frames.length?`Saved in memory · ${frames.length} frames`:'Not recording';
  $('record-button').textContent=recorder.active?'Stop recording':'Record session';
  $('export-button').disabled=!frames.length;
  $('mark-button').disabled=!recorder.active;
}
function feed(rgb,t,meta={}){
  lastTime=t;
  if(pendingDiagnosticReset){meta.resetProcessor=true;pendingDiagnosticReset=false;}
  const processingStart=performance.now();
  const data=rgb?processor.addSample(rgb,t,meta):processor.gap(meta.invalidReason||'No face detected',t);
  meta.processingMs=performance.now()-processingStart;
  if(source==='camera'){
    const feedback=captureFeedback.update(t,meta,data);meta.captureFeedback=feedback.metrics;
    if(t-lastFeedbackAt>=.25){
      lastFeedbackAt=t;$('capture-advice').textContent=feedback.priority;
      const nodes=feedback.rows.map(row=>{const el=document.createElement('div');el.className='capture-check';el.dataset.state=row.state;el.title=row.advice;const title=document.createElement('strong');title.textContent=row.name;const value=document.createElement('small');value.textContent=row.value;el.append(title,value);if(row.state==='warn'||row.state==='bad'){const advice=document.createElement('small');advice.textContent=row.advice;advice.className='check-advice';el.append(advice);}return el;});
      $('capture-checks').replaceChildren(...nodes);
    }
  }
  diagnostics.add(t,rgb,meta,data,processor.waveform);
  recorder.add(t,rgb,meta,data,processor.waveform);display(data);
  if(scene && $('scene-toggle').checked){scene.update({...data,coherence:0,breathing:null});for(const b of data.newBeats)if(b.valid)scene.triggerBeat();}
}
function stop(reason='Stopped — camera released'){
  diagnostics.event('stop',reason);diagnostics.stop();
  if(synthetic && recorder.data?.source==='synthetic' && recorder.origin!==null)recorder.data.reference={kind:'synthetic pulse peaks',beats:synthetic.beats.filter(t=>t>=recorder.origin&&t<=lastTime).map(t=>t-recorder.origin)};
  generation++;source=null;busy=false;captureFeedback.reset();lastFeedbackAt=-Infinity;
  $('capture-advice').textContent='Camera stopped. Start again to refresh capture checks.';$('capture-checks').replaceChildren();
  if(callback!==null && video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(callback);callback=null;
  clearInterval(timer);timer=null;
  if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
  recorder.stop();processor.gap(reason);face.lastLandmarks=null;previousLandmarks=null;previousBrightness=null;
  detectedAt=-Infinity;lastDetect=-Infinity;lastMedia=-1;frozen=null;synthetic=null;
  $('source-badge').textContent='CAMERA OFF';$('source-badge').classList.remove('demo');
  $('camera-button').disabled=false;$('demo-button').disabled=false;$('stop-button').disabled=true;$('record-button').disabled=true;
  $('camera-placeholder').style.display='flex';$('roi-preview').getContext('2d').clearRect(0,0,$('roi-preview').width,$('roi-preview').height);
  display();
}
function activate(kind){
  source=kind;processor.reset();captureFeedback.reset();lastFeedbackAt=-Infinity;
  $('capture-advice').textContent=kind==='synthetic'?'Synthetic demo — lighting and movement checks need a real camera.':'Checking your capture conditions…';$('capture-checks').replaceChildren();
  if(kind==='synthetic')diagnostics.start(kind,{...browserInfo,...settings},CONFIG);
  diagnostics.data.source=kind;diagnostics.setSettings(settings);diagnostics.event('capture','started');lastTime=0;frozen=null;$('freeze').checked=false;
  $('camera-button').disabled=true;$('demo-button').disabled=true;$('stop-button').disabled=false;$('record-button').disabled=false;
  $('source-badge').textContent=kind==='synthetic'?'SYNTHETIC · NOT A MEASUREMENT':'LIVE CAMERA';$('source-badge').classList.toggle('demo',kind==='synthetic');
}
function sampleFace(t){
  const landmarks=face.lastLandmarks;
  if(!landmarks || t-detectedAt>0.45){const overlay=$('roi-preview');overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height);return {rgb:null,meta:{invalidReason:'Face missing or tracking stale'}};}
  const w=canvas.width,h=canvas.height,pixels=context.getImageData(0,0,w,h).data;
  const sample=sampleFacePixels(landmarks,pixels,w,h,{motion,previousBrightness});
  const {boxes,meta:{invalidReason,brightness}}=sample;
  previousBrightness=brightness;
  const preview=$('roi-preview');if(preview.width!==w||preview.height!==h){preview.width=w;preview.height=h;}
  const ctx=preview.getContext('2d');ctx.clearRect(0,0,w,h);ctx.strokeStyle=invalidReason?'#dfb979':'#b4e6bc';ctx.lineWidth=2;for(const [i,b] of boxes.entries()){ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.save();ctx.translate(b.x+b.w/2,b.y-5);ctx.scale(-1,1);ctx.fillStyle='#ffffff';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText(['F','A','B'][i],0,0);ctx.restore();}
  return sample;
}
async function startCamera(){
  if(busy||source)return;busy=true;const token=++generation;
  diagnostics.start('camera',browserInfo,CONFIG);diagnostics.event('camera','permission requested');
  $('camera-button').disabled=true;$('demo-button').disabled=true;$('stop-button').disabled=false;$('status-message').textContent='Opening camera…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera requires HTTPS or localhost.');
    if(!video.requestVideoFrameCallback)throw new Error('This browser lacks video-frame callbacks. Use a current Chrome, Edge, Firefox or Safari.');
    const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:60}},audio:false});
    if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;video.srcObject=stream;await video.play();
    $('status-message').textContent='Loading face detection…';
    if(!face._ready)await face.init();
    if(token!==generation)return;
    const track=stream.getVideoTracks()[0];settings={...track.getSettings(),timing:'video mediaTime',requestedFps:60};
    track.addEventListener('ended',()=>{if(token===generation)stop('Camera disconnected');});
    $('camera-settings').textContent=`${settings.width} × ${settings.height} · requested 60 fps · actual ${settings.frameRate||'?'} fps`;
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    detectorCanvas.width=canvas.width;detectorCanvas.height=canvas.height;
    activate('camera');busy=false;$('camera-placeholder').style.display='none';
    let previousPresented=null;
    const frame=(now,meta)=>{
      if(token!==generation||source!=='camera')return;
      callback=video.requestVideoFrameCallback(frame);
      const t=meta.mediaTime;if(t<=lastMedia)return;lastMedia=t;
      const missedFrames=previousPresented===null?0:Math.max(0,meta.presentedFrames-previousPresented-1);previousPresented=meta.presentedFrames;
      context.drawImage(video,0,0,canvas.width,canvas.height);
      if(!face._processing && t-lastDetect>=.1){
        lastDetect=t;detectorCanvas.getContext('2d').drawImage(canvas,0,0);
        face.detect(detectorCanvas).then(()=>{
          if(token!==generation)return;detectedAt=t;
          const current=face.lastLandmarks;
          if(current && previousLandmarks){const width=Math.abs(current[234].x-current[454].x)||.1;motion=Math.hypot(current[1].x-previousLandmarks[1].x,current[1].y-previousLandmarks[1].y)/width;}else motion=0;
          previousLandmarks=current;
        }).catch(()=>{if(token===generation)stop('Face detection unavailable. Reload to retry.');});
      }
      const {rgb,meta:quality}=sampleFace(t);
      feed(rgb,t,{...quality,missedFrames,presentedFrames:meta.presentedFrames,callbackNow:now/1000});
    };
    callback=video.requestVideoFrameCallback(frame);
  }catch(error){if(token===generation)stop(error.name==='NotAllowedError'?'Camera permission denied. Allow access, then retry.':error.name==='NotFoundError'?'No camera found. Connect one and retry.':error.message);}
}
function startDemo(){
  if(busy||source)return;generation++;settings={timing:'synthetic timestamps',fps:30,bpm:72};
  synthetic=makeSynthetic({bpm:72,variability:.025,duration:7200});activate('synthetic');
  $('camera-settings').textContent='Generated 72 bpm pulse · no camera access';
  let frame=0;
  // Start with 12 seconds of explicitly synthetic history for immediate inspection.
  for(;frame<360;frame++){const t=frame/30,rgb=synthetic.sample(t),data=processor.addSample(rgb,t);diagnostics.add(t,rgb,{},data,processor.waveform);}
  lastTime=(frame-1)/30;display();
  timer=setInterval(()=>{const t=frame++/30;feed(synthetic.sample(t),t,{synthetic:true});},1000/30);
}
$('camera-button').addEventListener('click',startCamera);
$('demo-button').addEventListener('click',startDemo);
$('stop-button').addEventListener('click',()=>stop());
$('record-button').addEventListener('click',()=>{
  if(recorder.active)recorder.stop();else{
    recorder.start(source,{...settings,scene:$('scene-toggle').checked},CONFIG);
    // Every recording starts a new analysis chain; no pre-recording beats enter the export.
    processor.reset();pendingDiagnosticReset=true;diagnostics.event('processor','reset for recording');
    if(source==='synthetic')$('record-note').textContent='Synthetic recording — useful for software checks, not human accuracy.';
  }display();
});
$('mark-button').addEventListener('click',()=>{recorder.mark(lastTime,'manual sync marker');$('record-note').textContent=`Marker ${recorder.data.markers.length} added. Align with an independently recorded reference event.`;});
$('export-button').addEventListener('click',()=>{
  if(!recorder.data)return;
  if(source==='synthetic' && synthetic && recorder.origin!==null)recorder.data.reference={kind:'synthetic pulse peaks',beats:synthetic.beats.filter(t=>t>=recorder.origin&&t<=lastTime).map(t=>t-recorder.origin)};
  const blob=new Blob([JSON.stringify(recorder.data)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`pulse-${recorder.data.source}-${recorder.data.createdAt.replaceAll(':','-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('diagnostics-button').addEventListener('click',()=>{
  diagnostics.event('export','Diagnostic file downloaded locally');
  const blob=new Blob([JSON.stringify(diagnostics.data)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`pulse-diagnostics-${new Date().toISOString().replaceAll(':','-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('record-note').textContent='Attach the downloaded JSON in this chat. It contains numeric signal data and errors, not video.';
});
window.addEventListener('error',e=>diagnostics.event('error',e.message));
window.addEventListener('unhandledrejection',e=>diagnostics.event('promise rejection',e.reason?.message||e.reason));
$('freeze').addEventListener('change',()=>display());$('trace-scale').addEventListener('change',()=>display());window.addEventListener('resize',()=>display());
$('scene-toggle').addEventListener('change',async()=>{
  const enabled=$('scene-toggle').checked;
  recorder.mark(lastTime,enabled?'scene on':'scene off');
  document.body.classList.toggle('scene-on',enabled);
  if(!enabled){scene?.stop();return;}
  if(!scene && !sceneLoading){sceneLoading=true;try{
    if(!globalThis.THREE)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('Scene failed to load'));document.head.append(s);});
    const {SceneManager}=await import('./scene.js');scene=new SceneManager($('scene'));scene.init();
  }catch(error){$('status-message').textContent=error.message;$('scene-toggle').checked=false;document.body.classList.remove('scene-on');}finally{sceneLoading=false;}}
  if(scene && $('scene-toggle').checked)scene.start();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden && (source||busy))stop('Paused while tab was hidden — start again to resume');});
window.addEventListener('pagehide',()=>stop());
display();
