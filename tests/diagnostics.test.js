import { it } from 'node:test';
import assert from 'node:assert/strict';
import { Diagnostics } from '../js/diagnostics.js';
import { CONFIG } from '../js/measurement.js';
it('diagnostics retain a bounded replay window and exclude video and device identifiers',()=>{
  const d=new Diagnostics();d.start('camera',{deviceId:'private',groupId:'private',width:640},CONFIG);
  for(let t=0;t<150;t++)d.add(t,[120,130,110],{regions:[[120,130,110]],image:'private',landmarks:'private',deviceId:'private'},
    {timestamp:t,reason:'test',newBeats:[],hr:null,hrv:null});
  assert.equal(d.data.frames[0].t,29);assert.equal(d.data.frames.length,121);
  const serialized=JSON.stringify(d.data);assert.ok(!serialized.includes('private'));assert.equal(d.data.settings.width,640);
});
it('camera failures remain downloadable without any frames',()=>{
  const d=new Diagnostics();d.start('camera',{},CONFIG);d.event('error','Permission denied at https://example.org/?secret=123');d.stop();
  assert.equal(d.data.frames.length,0);assert.equal(d.data.events.length,1);assert.ok(!d.data.events[0].message.includes('secret'));
});
