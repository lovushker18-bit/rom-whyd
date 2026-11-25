/* ROM v19 ambient effect: low-cost, color-aware and pointer-safe. */
(()=>{'use strict';
 const canvas=document.getElementById('romGridCanvas');if(!canvas)return;
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const pointer={x:0,y:0,tx:0,ty:0,inside:false};
 let width=0,height=0,dpr=1,lastColor='',rgb=[139,255,114],frame=0,prev=0;
 const rgba=a=>`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
 function getColor(){
  const raw=getComputedStyle(document.body).getPropertyValue('--rom-grid-color').trim();
  if(raw===lastColor)return;
  lastColor=raw;const match=/^#([a-f\d]{6})$/i.exec(raw);
  rgb=match?[0,2,4].map(i=>parseInt(match[1].slice(i,i+2),16)):[139,255,114];
 }
 function resize(){width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
 function radial(x,y,radius,alpha){
  const g=ctx.createRadialGradient(x,y,0,x,y,radius);
  g.addColorStop(0,rgba(alpha));g.addColorStop(.45,rgba(alpha*.40));g.addColorStop(1,rgba(0));
  ctx.fillStyle=g;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
 }
 function render(ms){
  frame=requestAnimationFrame(render);
  if(ms-prev<38)return;prev=ms;
  ctx.clearRect(0,0,width,height);
  if(document.hidden||!document.body.classList.contains('romGridActive'))return;
  getColor();
  const time=reduced.matches?0:ms*.00012;
  // Very faint drifting ambient light, independent of mouse location.
  radial(width*(.24+.11*Math.sin(time)),height*(.34+.10*Math.cos(time*.77)),Math.max(310,width*.42),.034);
  radial(width*(.78+.09*Math.sin(time*.57+2)),height*(.70+.12*Math.sin(time*.95)),Math.max(280,width*.34),.025);
  if(!pointer.inside)return;
  pointer.x+=(pointer.tx-pointer.x)*(reduced.matches?1:.25);
  pointer.y+=(pointer.ty-pointer.y)*(reduced.matches?1:.25);
  const x=pointer.x,y=pointer.y,radius=155,spacing=41;
  radial(x,y,radius*1.15,.078);
  const left=Math.floor((x-radius)/spacing)*spacing,top=Math.floor((y-radius)/spacing)*spacing;
  ctx.lineWidth=.65;
  for(let gx=left;gx<x+radius;gx+=spacing){
   for(let gy=top;gy<y+radius;gy+=spacing){
    const dist=Math.hypot(gx-x,gy-y);if(dist>radius)continue;
    const strength=Math.pow(1-dist/radius,1.7);
    ctx.strokeStyle=rgba(.115*strength);
    ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gx+spacing,gy);ctx.moveTo(gx,gy);ctx.lineTo(gx,gy+spacing);ctx.stroke();
    ctx.fillStyle=rgba(.33*strength);ctx.beginPath();ctx.arc(gx,gy,.65+strength*.6,0,Math.PI*2);ctx.fill();
   }
  }
 }
 addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;pointer.tx=e.clientX;pointer.ty=e.clientY;if(!pointer.inside){pointer.x=pointer.tx;pointer.y=pointer.ty}pointer.inside=true},{passive:true});
 addEventListener('blur',()=>pointer.inside=false);
 document.addEventListener('pointerleave',()=>pointer.inside=false);
 addEventListener('resize',resize,{passive:true});
 resize();frame=requestAnimationFrame(render);
})();
