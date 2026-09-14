const average=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const item=(name,state,value,advice)=>({name,state,value,advice});
export class CaptureFeedback {
  constructor(){this.reset();}
  reset(){this.history=[];}
  update(t,meta,data){
    this.history.push({t,...meta});this.history=this.history.filter(p=>p.t>=t-5);
    const h=this.history,hasFace=Array.isArray(meta.regions)&&meta.regions.length===3;
    const duration=t-h[0].t,fps=duration>0?(h.length-1)/duration:0;
    const light=h.filter(p=>Number.isFinite(p.brightness)).map(p=>p.brightness),m=average(light);
    const change=m?Math.sqrt(average(light.map(v=>(v-m)**2)))/m:0;
    const regionLight=hasFace?meta.regions.map(([r,g,b])=>.2126*r+.7152*g+.0722*b):[];
    const balance=hasFace?Math.max(...regionLight)/Math.max(1,Math.min(...regionLight)):null;
    const movement=Math.max(0,...h.filter(p=>p.t>=t-1).map(p=>p.motion||0));
    const missing=h.reduce((s,p)=>s+(p.missedFrames||0),0),clip=meta.clipped||0;
    const area=meta.roiAreas?.length?Math.min(...meta.roiAreas):null;
    const rows=[
      item('Face tracking',hasFace?'ok':'bad',hasFace?'Face found':'No reliable face','Center your face and look toward the camera. Keep forehead and cheeks visible.'),
      item('Exposure',!hasFace?'pending':clip>.15||meta.brightness<20?'bad':clip>.03||meta.brightness<45?'warn':'ok',hasFace?`${Math.round(meta.brightness)} / 255 · ${(clip*100).toFixed(1)}% clipped`:'Waiting for face',clip>.03?'Reduce glare or move the light farther away. Avoid bright spots on your face.':'Add a steady, diffuse light in front of you. Avoid a bright window behind you.'),
      item('Light balance',!hasFace?'pending':balance>1.35?'warn':'ok',hasFace?`${balance.toFixed(2)}× spread · forehead / A / B: ${regionLight.map(v=>Math.round(v)).join(" / ")}`:'Waiting for face','Light both sides of your face evenly. Check that all three boxes cover skin, not hair, glasses, or background.'),
      item('Light stability',!hasFace||light.length<30?'pending':change>.025?'warn':'ok',hasFace?`${(change*100).toFixed(1)}% brightness variation`:'Waiting for face','Keep the light and screen brightness steady. Avoid changing screens and moving shadows; auto-exposure or movement can also cause this.'),
      item('Movement',!hasFace?'pending':movement>.08?'bad':movement>.025?'warn':'ok',hasFace?`${(movement*100).toFixed(1)}% face-width shift`:'Waiting for face','Rest your head comfortably, stop talking, and keep the camera still.'),
      item('Face size',!hasFace||area===null?'pending':area<100?'bad':area<400?'warn':'ok',area===null?'Waiting for measurement':`${Math.round(area)} px in smallest region`,'Move closer while keeping the forehead and both cheeks in view.'),
      item('Frame timing',duration<1?'pending':fps<20?'bad':fps<25||missing>3?'warn':'ok',duration>=1?`${fps.toFixed(1)} fps · ${missing} missed / 5 s`:'Measuring frame rate','Close other camera apps and busy tabs. Turn off the cathedral. Keep this page visible.'),
      item('Pulse agreement',!hasFace||data.agreement===null?'pending':data.agreement<.6?'warn':'ok',data.agreement===null?'Collecting signal':`${Math.round(data.agreement*100)} / 100 region agreement`,'The regions do not share a clear pulse. Check the boxes, improve even lighting, and stay still. The cause is not certain from this score alone.'),
    ];
    const problem=rows.find(r=>r.state==='bad')||rows.find(r=>r.state==='warn');
    return {rows,priority:problem?`${problem.name}: ${problem.advice}`:data.hr===null?'Capture checks look usable. Keep still while we look for a consistent pulse; these checks cannot guarantee one.':'Pulse accepted by the current quality checks. Keep these conditions steady.',
      metrics:{brightnessVariation:change,regionBrightness:regionLight,brightnessRatio:balance,movement,fps,missedFrames:missing}};
  }
}
