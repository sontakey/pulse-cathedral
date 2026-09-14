import {it} from 'node:test';
import assert from 'node:assert/strict';
import {CaptureFeedback} from '../js/capture-feedback.js';
const meta={regions:[[170,90,67],[176,92,66],[178,137,138]],brightness:124,clipped:0,motion:.004,roiAreas:[700,750,600]};
const data={hr:null,agreement:.15};
it('flags uneven regions without blaming movement or dark exposure',()=>{
 const c=new CaptureFeedback();let result;for(let i=0;i<100;i++)result=c.update(i/30,meta,data);
 const find=n=>result.rows.find(r=>r.name===n);
 assert.equal(find('Exposure').state,'ok');assert.equal(find('Movement').state,'ok');
 assert.equal(find('Light balance').state,'warn');assert.equal(find('Frame timing').state,'ok');assert.equal(find('Pulse agreement').state,'warn');
 assert.match(result.priority,/both sides/);
});
it('gives actionable exposure, movement, and face-loss feedback',()=>{
 const c=new CaptureFeedback();let r=c.update(0,{...meta,clipped:.3,motion:.1},data);
 assert.equal(r.rows.find(x=>x.name==='Exposure').state,'bad');assert.equal(r.rows.find(x=>x.name==='Movement').state,'bad');
 r=c.update(1,{},data);assert.equal(r.rows[0].state,'bad');assert.match(r.priority,/Center your face/);
});
it('detects variable light and low frame rate',()=>{
 const c=new CaptureFeedback();let r;for(let i=0;i<50;i++)r=c.update(i/15,{...meta,brightness:i%2?100:130},data);
 assert.equal(r.rows.find(x=>x.name==='Light stability').state,'warn');assert.equal(r.rows.find(x=>x.name==='Frame timing').state,'bad');
});
