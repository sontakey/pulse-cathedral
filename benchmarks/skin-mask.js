// Experimental full-face mask: excludes eyes/eyebrows and mouth; no reference-guided selection.
import {extractROIBox} from '../js/rppg.js';
const oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const exclusions=[[33,133,159,145,70,63,105,66,107],[263,362,386,374,336,296,334,293,300],[61,291,0,17,13,14]];
export function skinMaskRGB(landmarks,pixels,w,h,ctx){
 ctx.clearRect(0,0,w,h);ctx.fillStyle='white';ctx.beginPath();
 const center={x:landmarks[1].x,y:(landmarks[10].y+landmarks[152].y)/2};
 oval.forEach((i,k)=>{const p=landmarks[i],x=(center.x+.9*(p.x-center.x))*w,y=(center.y+.94*(p.y-center.y))*h;k?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();ctx.fill();
 for(const ids of exclusions){const b=extractROIBox(landmarks,ids,w,h),pad=3;ctx.clearRect(b.x-pad,b.y-pad,b.w+2*pad,b.h+2*pad)}
 const mask=ctx.getImageData(0,0,w,h).data;let n=0;const sums=[0,0,0];
 for(let i=0;i<pixels.length;i+=4)if(mask[i+3]>250){n++;for(let c=0;c<3;c++)sums[c]+=pixels[i+c]}
 return {rgb:n?sums.map(s=>s/n):null,pixels:n};
}
