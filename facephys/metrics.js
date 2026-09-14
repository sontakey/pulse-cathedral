// Experimental pulse-rate variability, not ECG-validated HRV. Never fills rejected intervals.
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
export const emptyHRV=()=>({bpm:null,ibi:null,sdnn:null,rmssd:null,pnn50:null,'LF/HF':null,breathingrate:null});
export function summarizeIntervals(rr) {
 const hrv=emptyHRV();if(rr.length<3)return hrv;
 const v=rr.map(x=>x.ms),m=avg(v);hrv.ibi=v.at(-1);hrv.bpm=60000/m;
 const duration=rr.at(-1).t-rr[0].start;
 if(duration<60)return hrv;
 const d=v.slice(1).map((x,i)=>x-v[i]);
 hrv.sdnn=Math.sqrt(avg(v.map(x=>(x-m)**2))*v.length/(v.length-1));
 hrv.rmssd=Math.sqrt(avg(d.map(x=>x*x)));hrv.pnn50=100*d.filter(x=>Math.abs(x)>50).length/d.length;
 if(duration<120)return hrv;
 // 4 Hz interpolation over a continuous accepted interval sequence, then Hann periodogram.
 const data=[];let j=1;
 for(let t=rr[0].t;t<=rr.at(-1).t;t+=.25){while(j<rr.length-1&&rr[j].t<t)j++;const a=rr[j-1],b=rr[j];data.push(a.ms+(b.ms-a.ms)*(t-a.t)/(b.t-a.t));}
 const center=avg(data);let lf=0,hf=0,best=0,resp=null;
 for(let f=.04;f<=.4;f+=.002){let re=0,im=0;data.forEach((v,i)=>{const x=(v-center)*(.5-.5*Math.cos(2*Math.PI*i/(data.length-1)));re+=x*Math.cos(2*Math.PI*f*i/4);im+=x*Math.sin(2*Math.PI*f*i/4)});const power=re*re+im*im;if(f<.15)lf+=power;else {hf+=power;if(power>best){best=power;resp=f*60}}}
 hrv['LF/HF']=hf>1e-8?lf/hf:null;hrv.breathingrate=hf>1e-8?resp:null;return hrv;
}
export class BeatMetrics {
 constructor(){this.reset()}
 reset(){this.samples=[];this.rr=[];this.lastBeat=null;this.result=emptyHRV();this.lastTime=null;this.reason='Collecting clean beats';}
 add(value,t,good){
  if(!Number.isFinite(value)||!Number.isFinite(t)){this.reset();this.reason='Invalid waveform or missing video timestamp';return this.result}
  if(!good){this.reset();this.reason='Signal quality too low';return this.result}
  if(t===this.lastTime)return this.result;
  if(this.lastTime!==null&&(t<=this.lastTime||t-this.lastTime>.15)){this.reset();this.reason='Timing discontinuity';}
  this.lastTime=t;this.samples.push({value,t});this.samples=this.samples.filter(x=>x.t>=t-8);
  if(this.lastBeat!==null&&t-this.lastBeat>1.5){this.rr=[];this.result=emptyHRV();this.lastBeat=null;this.reason='No recent beat';}
  const n=this.samples.length;if(n<5)return this.result;
  const a=this.samples[n-3],b=this.samples[n-2],c=this.samples[n-1];
  const values=this.samples.map(x=>x.value),m=avg(values),sd=Math.sqrt(avg(values.map(x=>(x-m)**2)));
  if(sd<1e-8||!(b.value>a.value&&b.value>=c.value&&b.value>m+.2*sd))return this.result;
  const left=(b.value-a.value)/(b.t-a.t),right=(c.value-b.value)/(c.t-b.t);
  const curvature=(right-left)/(c.t-a.t);
  const vertex=curvature<0?(a.t+b.t)/2-left/(2*curvature):b.t;
  const beatTime=Math.max(a.t,Math.min(c.t,vertex));
  if(this.lastBeat!==null&&beatTime-this.lastBeat<.3)return this.result;
  if(this.lastBeat!==null){const ms=(beatTime-this.lastBeat)*1000;const recent=this.rr.slice(-5).map(x=>x.ms).sort((a,b)=>a-b);const median=recent.length?recent[Math.floor(recent.length/2)]:ms;
   if(ms>1500||Math.abs(ms-median)>.25*median){this.rr=[];this.result=emptyHRV();this.reason='Irregular or missed beat — rebuilding';}
   else {this.rr.push({start:this.lastBeat,t:beatTime,ms});this.rr=this.rr.filter(x=>x.start>=t-180);this.result=summarizeIntervals(this.rr);this.reason=this.result.sdnn===null?'Collecting 60 seconds of clean intervals':this.result['LF/HF']===null?'Collecting 120 seconds for spectral estimates':'Experimental pulse-derived metrics';}}
  this.lastBeat=beatTime;return this.result;
 }
}
