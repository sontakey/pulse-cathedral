export class SessionRecorder {
  constructor(){this.active=false;this.data=null;}
  start(source,settings,config){
    const {deviceId,groupId,...safeSettings}=settings;
    this.data={schema:'pulse-cathedral/1',createdAt:new Date().toISOString(),source,settings:safeSettings,config,
      clock:'seconds relative to session start; sync markers are manual, not hardware sync',
      reference:null,frames:[],waveform:[],beats:[],readouts:[],markers:[],events:[]};
    this.active=true;this.origin=null;this.lastReadout=-Infinity;this.lastWave=-Infinity;
  }
  add(t,rgb,meta,result,waveform=[]){
    if(!this.active)return;
    if(this.origin===null)this.origin=t;
    const at=t-this.origin;
    this.data.frames.push({t:at,rgb,...meta});
    for(const point of waveform)if(point.t>this.lastWave && point.t>=this.origin){
      this.data.waveform.push({t:point.t-this.origin,value:point.value});this.lastWave=point.t;
    }
    for(const b of result.newBeats||[])this.data.beats.push({...b,t:b.t-this.origin,confirmedAt:b.confirmedAt-this.origin});
    if(t-this.lastReadout>=0.24){
      const {newBeats,...reading}=result;
      if(reading.hrWindow)reading.hrWindow={start:reading.hrWindow.start-this.origin,end:reading.hrWindow.end-this.origin};
      this.data.readouts.push({...reading,t:at,timestamp:at});this.lastReadout=t;
    }
    // Bound memory without silently discarding the start of a recording.
    if(this.data.frames.length>=36000){this.active=false;this.data.events.push({t:at,reason:'recording limit reached'});}
  }
  mark(t,label){if(this.active && this.origin!==null)this.data.markers.push({t:t-this.origin,label});}
  stop(){this.active=false;}
}
