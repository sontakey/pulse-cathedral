import { SessionRecorder } from './recording.js';

// Local, bounded replay buffer. Never stores pixels, video, landmarks or device IDs.
export class Diagnostics extends SessionRecorder {
  start(source,settings,config){
    super.start(source,{},config);
    this.data.kind='diagnostic';this.data.retentionSeconds=120;
    this.data.privacy='Numeric RGB region means only. No images, video, audio, landmarks, device IDs or automatic upload.';
    this.data.events=[];this.trimmedAt=-Infinity;this.previousReason=null;
    this.wallOrigin=performance.now();this.setSettings(settings);
  }
  setSettings(settings){
    const allowed=['width','height','frameRate','fps','requestedFps','facingMode','timing','browser','platform','appVersion','secureContext','videoFrameCallback'];
    for(const key of allowed)if(settings[key]!==undefined)this.data.settings[key]=settings[key];
  }
  event(type,message){
    if(!this.data)return;
    this.data.events.push({wallSeconds:(performance.now()-this.wallOrigin)/1000,type,
      message:String(message).replace(/https?:\/\/[^\s)]+/g,s=>s.split('?')[0].split('#')[0]).slice(0,1000)});
    if(this.data.events.length>200)this.data.events.shift();
  }
  add(t,rgb,meta,result,waveform=[]){
    // Whitelist metadata as well as settings to prevent accidental image/ID collection.
    const safe={};for(const key of ['regions','motion','brightness','clipped','invalidReason','missedFrames','presentedFrames','processingMs','callbackNow','resetProcessor','roiAreas','captureFeedback'])if(meta[key]!==undefined)safe[key]=meta[key];
    super.add(t,rgb,safe,result,waveform);
    if(result.reason!==this.previousReason){this.event('signal',result.reason);this.previousReason=result.reason;}
    if(this.origin!==null && t-this.trimmedAt>=1){
      this.trimmedAt=t;const cutoff=t-this.origin-this.data.retentionSeconds;
      for(const key of ['frames','waveform','beats','readouts','markers'])this.data[key]=this.data[key].filter(p=>p.t>=cutoff);
      this.data.retainedStart=this.data.frames[0]?.t??null;
    }
  }
}
