export function drawTrace(canvas,wave,beats,{scale='auto',end=null,accepted=false}={}) {
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  const width=Math.max(1,rect.width),height=Math.max(1,rect.height);
  if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const left=38,right=12,top=16,bottom=26,w=width-left-right,h=height-top-bottom;
  ctx.strokeStyle='#2a342d';ctx.lineWidth=0.6;ctx.font='9px monospace';ctx.fillStyle='#778c7e';
  for(let i=0;i<=10;i++){const x=left+w*i/10;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,top+h);ctx.stroke();if(i%2===0)ctx.fillText(`${i-10}s`,x-8,height-7);}
  for(let i=0;i<=4;i++){const y=top+h*i/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+w,y);ctx.stroke();}
  if(!wave.length)return;
  const last=end??wave.at(-1).t,first=last-10,points=wave.filter(p=>p.t>=first&&p.t<=last);
  const amplitude=scale==='auto'?Math.max(1e-6,...points.map(p=>Math.abs(p.value)))*1.15:Number(scale);
  const x=t=>left+(t-first)/10*w,y=v=>top+h/2-v/amplitude*h/2;
  ctx.fillText(amplitude.toFixed(3),0,top+5);ctx.fillText('0',24,top+h/2+3);ctx.fillText((-amplitude).toFixed(3),0,top+h);
  ctx.save();ctx.beginPath();ctx.rect(left,top,w,h);ctx.clip();ctx.strokeStyle=accepted?'#a0d8b4':'#dfb979';ctx.lineWidth=1.7;ctx.beginPath();
  points.forEach((p,i)=>{if(!i||p.t-points[i-1].t>0.1)ctx.moveTo(x(p.t),y(p.value));else ctx.lineTo(x(p.t),y(p.value));});ctx.stroke();
  for(const b of beats.filter(b=>b.t>=first&&b.t<=last)){
    let closest=points[0];for(const p of points)if(Math.abs(p.t-b.t)<Math.abs(closest.t-b.t))closest=p;
    if(!closest)continue;ctx.fillStyle=b.valid?'#ccf1d2':'#dfb979';ctx.beginPath();ctx.arc(x(b.t),y(closest.value),3,0,2*Math.PI);ctx.fill();
  }
  ctx.restore();
}
