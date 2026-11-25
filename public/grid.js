/* Decorative canvas, no pointer interception, no user tracking. */
(()=>{'use strict';
 const canvas=document.getElementById('romGridCanvas');if(!canvas)return;
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let width=0,height=0,dpr=1,frame=0,raf=0,visible=true;
 const pointer={x:-10000,y:-10000,tx:-10000,ty:-10000};
 function resize(){dpr=Math.min(devicePixelRatio||1,1.5);width=innerWidth;height=innerHeight;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
 function draw(){
  raf=0;if(!visible||!document.body.classList.contains('romGridActive'))return;
  ctx.clearRect(0,0,width,height);
  pointer.x+=(pointer.tx-pointer.x)*.065;pointer.y+=(pointer.ty-pointer.y)*.065;
  const spacing=58,ox=(frame*.07)%spacing,oy=(frame*.045)%spacing;
  const active=pointer.x>-1000;
  for(let x=ox-spacing;x<width+spacing;x+=spacing){
   for(let y=oy-spacing;y<height+spacing;y+=spacing){
    const dist=active?Math.hypot(x-pointer.x,y-pointer.y):9999;
    const influence=Math.max(0,1-dist/220);
    const alpha=.042+influence*.23;
    ctx.fillStyle=`rgba(161,240,124,${alpha})`;
    ctx.beginPath();ctx.arc(x,y,1+influence*1.4,0,Math.PI*2);ctx.fill();
    if(influence>.13){ctx.strokeStyle=`rgba(129,228,104,${influence*.085})`;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+spacing,y);ctx.moveTo(x,y);ctx.lineTo(x,y+spacing);ctx.stroke()}
   }
  }
  if(active){const glow=ctx.createRadialGradient(pointer.x,pointer.y,0,pointer.x,pointer.y,240);glow.addColorStop(0,'rgba(111,206,91,.065)');glow.addColorStop(1,'rgba(111,206,91,0)');ctx.fillStyle=glow;ctx.fillRect(pointer.x-240,pointer.y-240,480,480)}
  if(!reduced.matches){frame++;raf=requestAnimationFrame(draw)}
 }
 function tick(){if(!raf)raf=requestAnimationFrame(draw)}
 addEventListener('pointermove',e=>{pointer.tx=e.clientX;pointer.ty=e.clientY;if(reduced.matches)tick()},{passive:true});
 document.addEventListener('pointerleave',()=>{pointer.tx=-10000;pointer.ty=-10000});
 document.addEventListener('visibilitychange',()=>{visible=!document.hidden;if(visible)tick()});
 addEventListener('resize',()=>{resize();tick()},{passive:true});
 const observer=new MutationObserver(()=>{if(document.body.classList.contains('romGridActive'))tick();else ctx.clearRect(0,0,width,height)});
 observer.observe(document.body,{attributes:true,attributeFilter:['class']});
 resize();tick();
})();
