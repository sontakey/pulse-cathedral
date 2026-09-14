import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { RPPGProcessor, CONFIG, intervalStats, biquadCoefficients } from '../js/measurement.js';
import { makeSynthetic } from '../js/synthetic.js';
import { SessionRecorder } from '../js/recording.js';
import { scoreBeats } from '../benchmarks/score.js';

function run({fps=30,bpm=90,seconds=25,gap=false}={}){
 const p=new RPPGProcessor(),s=makeSynthetic({bpm}),beats=[];
 for(let i=0;i<seconds*fps;i++){const t=i/fps;const data=gap&&t>=12&&t<13?p.gap('face lost',t):p.addSample(s.sample(t),t);beats.push(...data.newBeats);}
 return {p,beats};
}
describe('timestamped measurement integration',()=>{
 it('requires a timestamp and rejects duplicate frames',()=>{
  const p=new RPPGProcessor();assert.throws(()=>p.addSample([120,130,100]),/timestamp/);
  p.addSample([120,130,100],1);p.addSample([120,130,100],1);assert.equal(p.samples.length,1);assert.equal(p.duplicates,1);
 });
 it('90 bpm stays 90 at both 30 and 60 fps; beat events continue beyond buffer length',()=>{
  for(const fps of [30,60]){const {p,beats}=run({fps});assert.ok(Math.abs(p.result.hr-90)<2);assert.ok(beats.some(b=>b.valid&&b.t>21));assert.ok(beats.length>15);}
 });
 it('does not calculate intervals across a face-loss gap',()=>{
  const {p}=run({gap:true});assert.ok(!p.intervals.some(b=>b.start<12&&b.t>13));assert.equal(p.result.hrv,null);
 });
 it('long frame gaps discard warmup and stale readouts immediately',()=>{
  const {p}=run();const r=p.addSample([130,120,100],30);assert.equal(r.hr,null);assert.equal(r.ibi,null);assert.equal(r.hrv,null);assert.equal(p.samples.length,1);
 });
 it('never produces HRV from a short recording',()=>{const {p}=run();assert.equal(p.result.hrv,null);assert.equal(p.result.sdnn,null);});
 it('flat RGB yields no HR or accepted beats',()=>{
  const p=new RPPGProcessor();for(let i=0;i<450;i++)p.addSample([120,120,120],i/30);assert.equal(p.result.hr,null);assert.ok(p.beats.every(b=>!b.valid));
 });
 it('builds cutoff-specific filter coefficients for different sampling rates',()=>{
  for(const fs of [30,60])for(const [type,f] of [['highpass',.7],['lowpass',4]]){
   const {a,b}=biquadCoefficients(type,f,fs),w=2*Math.PI*f/fs;
   const mag=c=>Math.hypot(c[0]+c[1]*Math.cos(w)+c[2]*Math.cos(2*w),-c[1]*Math.sin(w)-c[2]*Math.sin(2*w));
   assert.ok(Math.abs(mag(b)/mag(a)-Math.SQRT1_2)<1e-8);
  }
 });
});
describe('interval validation and benchmark scoring',()=>{
 it('preserves adjacency across rejected intervals',()=>{
  const intervals=Array.from({length:60},(_,i)=>({start:i,t:i+1,ibiMs:1000,valid:true,segment:0}));
  intervals[29].valid=false;intervals[30].valid=false;
  const result=intervalStats(intervals,60);assert.equal(result.rmssd,0);assert.equal(result.count,58);assert.equal(result.coverage,58/60);
 });
 it('withholds HRV below coverage threshold',()=>{
  const intervals=Array.from({length:20},(_,i)=>({start:i,t:i+1,ibiMs:1000,valid:true,segment:0}));assert.equal(intervalStats(intervals,60).rmssd,null);
 });
 it('does not compare intervals across a missed reference beat',()=>{
  const p=[0,1,3,4].map(t=>({t,valid:true,segment:0}));const s=scoreBeats(p,[0,1,2,3,4]);assert.equal(s.missedBeats,1);assert.equal(s.matchedAdjacentIntervals,2);assert.equal(s.ibiMAEMs,0);
 });
 it('does not hide false beats or silently optimize alignment',()=>{
  const p=[.4,1.4,2.4].map(t=>({t,valid:true,segment:0}));assert.equal(scoreBeats(p,[0,1,2]).matchedBeats,0);assert.equal(scoreBeats(p,[0,1,2],{offset:.4}).matchedBeats,3);
 });
 it('recording exports relative times, invalid frames, and manual markers',()=>{
  const r=new SessionRecorder();r.start('camera',{fps:30},CONFIG);
  const empty={pulse:0,hr:null,newBeats:[],timestamp:10};r.add(10,null,{invalidReason:'face lost'},empty);
  r.add(11,[120,130,100],{}, {...empty,newBeats:[{t:10.5,confirmedAt:11,valid:true}]});r.mark(11,'sync');r.stop();
  assert.equal(r.data.frames[0].t,0);assert.equal(r.data.frames[0].rgb,null);assert.equal(r.data.beats[0].t,.5);assert.equal(r.data.markers[0].t,1);assert.equal(r.active,false);
 });
});
