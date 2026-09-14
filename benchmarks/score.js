import { mean } from '../js/measurement.js';
const quantile=(a,q)=>a.length?[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*q)]:null;
function stats(intervals){
  if(intervals.length<2)return {rmssd:null,sdnn:null};
  const avg=mean(intervals),diff=intervals.slice(1).map((x,i)=>(x-intervals[i])**2);
  return {rmssd:Math.sqrt(mean(diff)),sdnn:Math.sqrt(intervals.reduce((s,x)=>s+(x-avg)**2,0)/(intervals.length-1))};
}
// Fixed clock offset only. No time warping, filling missed beats, or joining across gaps.
export function scoreBeats(predicted,reference,{start=0,end=Infinity,offset=0,tolerance=.2}={}){
  const p=predicted.filter(b=>b.t>=start&&b.t<=end),r=reference.filter(t=>t+offset>=start&&t+offset<=end).map(t=>t+offset);
  const matches=[];let next=0;
  for(let i=0;i<p.length;i++){
    if(!p[i].valid)continue;
    let best=-1,distance=tolerance;
    for(let j=next;j<r.length && r[j]<=p[i].t+tolerance;j++)if(Math.abs(r[j]-p[i].t)<distance){best=j;distance=Math.abs(r[j]-p[i].t);}
    if(best>=0){matches.push({pi:i,ri:best});next=best+1;}
  }
  const errors=[];
  for(let i=1;i<matches.length;i++){
    const a=matches[i-1],b=matches[i];
    if(b.pi===a.pi+1 && b.ri===a.ri+1 && p[b.pi].segment===p[a.pi].segment){
      errors.push(Math.abs((p[b.pi].t-p[a.pi].t)-(r[b.ri]-r[a.ri]))*1000);
    }
  }
  const reported=p.filter(b=>b.valid).length,tp=matches.length;
  return {referenceBeats:r.length,reportedBeats:reported,matchedBeats:tp,falseBeats:reported-tp,missedBeats:r.length-tp,
    precision:reported?tp/reported:null,recall:r.length?tp/r.length:null,f1:reported+r.length?2*tp/(reported+r.length):null,
    matchedAdjacentIntervals:errors.length,ibiMAEMs:errors.length?mean(errors):null,ibiMedianMs:quantile(errors,.5),ibiP95Ms:quantile(errors,.95),offsetSeconds:offset,toleranceSeconds:tolerance};
}
export function referenceHRV(beats,start,end){
  const b=beats.filter(t=>t>=start&&t<=end);return stats(b.slice(1).map((t,i)=>(t-b[i])*1000));
}

export function scoreReadouts(readouts,reference,{offset=0,lookahead=2,hrvSeconds=60}={}){
  const ref=reference.map(t=>t+offset),diff={hr:[],rmssd:[],sdnn:[]};
  for(const d of readouts){
    if(d.hr!==null && d.hrWindow){
      const b=ref.filter(t=>t>=d.hrWindow.start&&t<=d.hrWindow.end);
      if(b.length>1)diff.hr.push(d.hr-60*(b.length-1)/(b.at(-1)-b[0]));
    }
    if(d.hrv!==null){
      const r=referenceHRV(ref,d.timestamp-lookahead-hrvSeconds,d.timestamp-lookahead);
      if(r.rmssd!==null)diff.rmssd.push(d.hrv-r.rmssd);
      if(r.sdnn!==null && d.sdnn!==null)diff.sdnn.push(d.sdnn-r.sdnn);
    }
  }
  return Object.fromEntries(Object.entries(diff).map(([name,errors])=>{
    const bias=errors.length?mean(errors):null;
    const sd=errors.length>1?Math.sqrt(errors.reduce((s,v)=>s+(v-bias)**2,0)/(errors.length-1)):null;
    return [name,{windows:errors.length,mae:errors.length?mean(errors.map(Math.abs)):null,bias,
      lowerAgreementLimit:sd===null?null:bias-1.96*sd,upperAgreementLimit:sd===null?null:bias+1.96*sd,
      units:name==='hr'?'bpm':'ms'}];
  }));
}
