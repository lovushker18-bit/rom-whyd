/* ROM interactive ambient grid. Decorative only, behind UI; never receives pointer events. */
(()=>{'use strict';
 const canvas=document.getElementById('romGridCanvas');if(!canvas)return;
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const pointer={x:-9999,y:-9999,targetX:-9999,targetY:-9999,inside:false};
 let w=0,h=0,dpr=1,frame=0,raf=0,rgb=[139,255,114],lastColor='';
 const clamp=v=>Math.max(0,Math.min(255,v|0));
 function color(){const raw=getComputedStyle(document.body).getPropertyValue('--rom-grid-color').trim();if(raw===lastColor)return;lastColor=raw;const m=/^#([a-f\d]{6})$/i.exec(raw);rgb=m?[0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16)):[139,255,114]}
 const rgba=(a)=>`rgba(${rgb.map(clamp).join(',')},${a})`;
 function resize(){dpr=Math.min(devicePixelRatio||1,1.6);w=innerWidth;h=innerHeight;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);request()}
 function enabled(){return document.body.classList.contains('romGridActive')&&!document.hidden}
 function render(){raf=0;ctx.clearRect(0,0,w,h);if(!enabled()||!pointer.inside)return;
 color();
 if(pointer.x<0){pointer.x=pointer.targetX;pointer.y=pointer.targetY}
 const easing=reduced.matches?1:.2;
 pointer.x+=(pointer.targetX-pointer.x)*easing;pointer.y+=(pointer.targetY-pointer.y)*easing;
 const x=pointer.x,y=pointer.y,radius=260,step=42;
 const glow=ctx.createRadialGradient(x,y,0,x,y,radius);
 glow.addColorStop(0,rgba(.095));glow.addColorStop(.35,rgba(.045));glow.addColorStop(1,rgba(0));
 ctx.fillStyle=glow;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
 const left=Math.floor((x-radius)/step)*step,right=Math.ceil((x+radius)/step)*step;
 const top=Math.floor((y-radius)/step)*step,bottom=Math.ceil((y+radius)/step)*step;
 ctx.lineWidth=.7;
 for(let gx=left;gx<=right;gx+=step){for(let gy=top;gy<=bottom;gy+=step){
  const dist=Math.hypot(gx-x,gy-y);if(dist>=radius)continue;
  const t=Math.pow(1-dist/radius,1.6);
  ctx.strokeStyle=rgba(t*.19);ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gx+step,gy);ctx.moveTo(gx,gy);ctx.lineTo(gx,gy+step);ctx.stroke();
  ctx.fillStyle=rgba(.12+t*.62);ctx.beginPath();ctx.arc(gx,gy,.7+t*1.05,0,Math.PI*2);ctx.fill();
 }}
 if(!reduced.matches&&(Math.abs(pointer.x-pointer.targetX)>.35||Math.abs(pointer.y-pointer.targetY)>.35))request();
 }
 function request(){if(!raf)raf=requestAnimationFrame(render)}
 addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;pointer.targetX=e.clientX;pointer.targetY=e.clientY;pointer.inside=true;request()},{passive:true});
 document.addEventListener('pointerleave',()=>{pointer.inside=false;request()});
 document.addEventListener('visibilitychange',request);
 addEventListener('resize',resize,{passive:true});
 const observer=new MutationObserver(request);observer.observe(document.body,{attributes:true,attributeFilter:['class','style']});
 resize();
})();
