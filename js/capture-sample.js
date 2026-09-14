// Shared pixel extraction for live capture and deterministic public-video replay.
import { extractROIBox, meanRGBFromROI } from './rppg.js';
const regions=[[10,67,69,104,108,109,151,299,297,338,337,336],[36,50,116,117,118,119,123,132,147,187,205,206],[266,280,345,346,347,348,352,361,376,411,425,426]];
export function sampleFacePixels(landmarks,pixels,w,h,{motion=0,previousBrightness=null}={}) {
  const boxes=regions.map(indices=>{
    const b=extractROIBox(landmarks,indices,w,h),dx=Math.floor(b.w*.18),dy=Math.floor(b.h*.18);
    return {x:b.x+dx,y:b.y+dy,w:Math.max(0,b.w-2*dx),h:Math.max(0,b.h-2*dy)};
  });
  const colors=boxes.map(b=>meanRGBFromROI(pixels,w,b));
  const rgb=[0,1,2].map(c=>colors.reduce((s,r)=>s+r[c],0)/3),brightness=rgb.reduce((a,b)=>a+b,0)/3;
  let clipped=0,count=0;
  for(const b of boxes)for(let y=b.y;y<b.y+b.h;y+=2)for(let x=b.x;x<b.x+b.w;x+=2){const i=(y*w+x)*4;count++;if(pixels[i]>250||pixels[i+1]>250||pixels[i+2]>250||Math.max(pixels[i],pixels[i+1],pixels[i+2])<8)clipped++;}
  let invalidReason=null;
  if(boxes.some(b=>b.w*b.h<100))invalidReason='Move closer — face regions too small';
  else if(brightness<20 || clipped/Math.max(1,count)>.15)invalidReason='Exposure too dark or clipped';
  else if(motion>.08)invalidReason='Head movement — hold still';
  else if(previousBrightness!==null && Math.abs(brightness/previousBrightness-1)>.04)invalidReason='Lighting changed — rebuilding signal';
  return {rgb,boxes,meta:{regions:colors,motion,brightness,clipped:clipped/Math.max(1,count),roiAreas:boxes.map(b=>b.w*b.h),invalidReason}};
}
