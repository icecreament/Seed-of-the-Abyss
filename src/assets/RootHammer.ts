import type { PixelCanvas } from './PixelFactory';
const INK='#1a1020',STONE='#3d3558',HI='#5a4f78',EDGE='#b8ae9c',SHAFT='#87745b';
/** Body pixels stay inside a 32px cell; feet stay at their original y21..25 anchors. */
export function drawRootHammer(pc:Pick<PixelCanvas,'p'|'rect'>,frame:number,base:Pick<PixelCanvas,'source'>):void {
  const source=base.source.getContext('2d')!.getImageData(0,0,32,32).data;
  for(let y=0;y<32;y++)for(let x=0;x<32;x++) {
    const i=(y*32+x)*4;if(!source[i+3]||x>=24&&y>=8&&y<16)continue;
    let dx=0,dy=0;
    if(y<21){
      const upper=(21-y)/17;
      if(frame===0){dx=-Math.round(upper);dy=Math.round(upper);}
      if(frame===2){dx=Math.round(upper);dy=Math.round(upper*4);}
      if(frame===3)dy=Math.round(upper*2);
      if(frame===4){dx=-Math.round(upper*2);dy=Math.round(upper*3);}
      if(frame===5)dy=Math.round(upper);
    }
    pc.p(x+dx,y+dy,'#'+[source[i],source[i+1],source[i+2]].map(v=>v.toString(16).padStart(2,'0')).join(''));
  }
  const line=(ax:number,ay:number,bx:number,by:number,color:string,width=2)=>{
    const steps=Math.max(Math.abs(bx-ax),Math.abs(by-ay));
    for(let i=0;i<=steps;i++){const t=steps?i/steps:0;pc.rect(Math.round(ax+(bx-ax)*t),Math.round(ay+(by-ay)*t),width,width,color);}
  };
  const hammer=(x:number,y:number,w:number,h:number)=>{
    pc.rect(x,y,w,h,INK);pc.rect(x+1,y+1,w-2,h-2,STONE);
    pc.rect(x+1,y+1,w-2,1,HI);pc.rect(x+1,y+1,1,h-2,EDGE);
    pc.rect(x+w-3,y+2,1,h-3,HI);pc.p(x+3,y+2,EDGE);
  };
  if(frame===0){line(22,14,25,17,INK,3);line(25,15,27,11,SHAFT);hammer(25,5,7,7);pc.rect(24,15,3,2,EDGE);}
  else if(frame===1){line(22,14,26,10,INK,3);line(26,13,26,6,SHAFT);hammer(20,0,12,7);pc.rect(25,11,3,2,EDGE);}
  else if(frame===2){line(23,16,26,19,INK,3);line(25,16,27,21,SHAFT);hammer(24,21,8,5);pc.rect(24,17,3,2,EDGE);}
  else if(frame===3){line(22,17,25,19,INK,3);line(25,17,27,21,SHAFT);hammer(24,21,8,5);pc.rect(24,18,3,2,EDGE);}
  else if(frame===4){line(21,15,24,13,INK,3);line(24,13,28,17,SHAFT);hammer(26,16,6,7);pc.rect(23,13,3,2,EDGE);}
  else {line(22,16,25,18,INK,3);line(24,18,27,15,SHAFT);hammer(25,9,7,7);pc.rect(24,17,3,2,EDGE);}
}
