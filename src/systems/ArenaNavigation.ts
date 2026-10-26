import { segmentRectEntry } from './CombatFeel';
type Point={x:number;y:number};
type Rect=Point&{width:number;height:number};
/** Shared reverse BFS: one field for all mobs, rebuilt only when the target changes cells. */
export class ArenaNavigation {
  private blocked:Uint8Array;
  private distances:Int16Array;
  private queue:Int32Array;
  private targetCell=-1;
  constructor(private cols:number,private rows:number,private tile:number,private walls:readonly Rect[]) {
    this.blocked=new Uint8Array(cols*rows);this.distances=new Int16Array(cols*rows);this.queue=new Int32Array(cols*rows);
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++) {
      const px=(x+0.5)*tile,py=(y+0.5)*tile;
      if(walls.some(r=>px>=r.x-23&&px<=r.x+r.width+23&&py>=r.y-14&&py<=r.y+r.height+30))this.blocked[y*cols+x]=1;
    }
  }
  clearLine(ax:number,ay:number,bx:number,by:number):boolean {
    return !this.walls.some(r=>segmentRectEntry(ax,ay,bx,by,r)!==null);
  }
  private routeClear(ax:number,ay:number,bx:number,by:number):boolean {
    return !this.walls.some(r=>segmentRectEntry(ax,ay,bx,by,{x:r.x-23,y:r.y-14,width:r.width+46,height:r.height+44})!==null);
  }
  waypoint(x:number,y:number,tx:number,ty:number):Point {
    if(this.routeClear(x,y,tx,ty)||(Math.hypot(tx-x,ty-y)<64&&this.clearLine(x,y,tx,ty)))return{x:tx,y:ty};
    let target=this.cell(tx,ty);
    if(this.blocked[target]) {
      let best=Infinity;
      for(let i=0;i<this.blocked.length;i++)if(!this.blocked[i]){
        const p=this.center(i),d=(p.x-tx)**2+(p.y-ty)**2;if(d<best){best=d;target=i;}
      }
    }
    if(target!==this.targetCell)this.rebuild(target);
    const cell=this.cell(x,y);let best=-1,bestDist=32767;
    for(const n of this.neighbors(cell))if(!this.blocked[n]&&this.distances[n]>=0&&this.distances[n]<bestDist){best=n;bestDist=this.distances[n];}
    if(best<0)return{x,y};
    const next=this.center(best);
    // Route via the current cell center before turning a pillar corner.
    // A diagonal shortcut from an off-center body can otherwise clip the wall.
    return this.blocked[cell]||this.routeClear(x,y,next.x,next.y)?next:this.center(cell);
  }
  private rebuild(target:number):void {
    this.targetCell=target;this.distances.fill(-1);let read=0,write=0;
    if(this.blocked[target])return;
    this.queue[write++]=target;this.distances[target]=0;
    while(read<write){const cell=this.queue[read++];for(const n of this.neighbors(cell))if(!this.blocked[n]&&this.distances[n]<0){this.distances[n]=this.distances[cell]+1;this.queue[write++]=n;}}
  }
  private neighbors(i:number):number[]{const x=i%this.cols,y=Math.floor(i/this.cols),out:number[]=[];if(x>0)out.push(i-1);if(x<this.cols-1)out.push(i+1);if(y>0)out.push(i-this.cols);if(y<this.rows-1)out.push(i+this.cols);return out;}
  private cell(x:number,y:number):number {return Math.max(0,Math.min(this.rows-1,Math.floor(y/this.tile)))*this.cols+Math.max(0,Math.min(this.cols-1,Math.floor(x/this.tile)));}
  private center(i:number):Point{return{x:(i%this.cols+0.5)*this.tile,y:(Math.floor(i/this.cols)+0.5)*this.tile};}
}
