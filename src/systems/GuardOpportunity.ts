import { PLAYER_PROJECTILE_RADIUS, segmentCircleEntry, segmentRectEntry } from './CombatFeel';
import { WARDEN_BULWARK_RADIUS, bulwarkPrevented } from './WardenReprisal';

/** A conditional stand-still brace opportunity, never a guaranteed future hit. */
export const GUARD_OPPORTUNITY = { minETA: 350, maxETA: 1500, safety: 60 } as const;
export interface GuardSource {
  x:number; y:number; vx:number; vy:number; life:number; damage:number; active:boolean;
  kind:'projectile'|'tell'; delay:number;
  body?:{x:number;y:number;radius:number};
}
export interface GuardOpportunity { x:number; y:number; eta:number; kind:'projectile'|'tell'; }
export interface GuardWindow { minETA:number; maxETA:number; openingBlast:boolean; }
type Rect={x:number;y:number;width:number;height:number};

/** Uses the actual swept projectile predicate and wall-first tie rule. Reads only.
 * Assumes the player stops at the current position and an existing committed tell is not interrupted.
 * Rejects lethal/no-income hits and tells the opening blast would cancel. No shots are created here.
 */
export function findGuardOpportunity(sources:Iterable<GuardSource>,walls:readonly Rect[],player:{x:number;y:number;hp:number;armor:number},window:GuardWindow,view?:Rect):GuardOpportunity|undefined {
  const {x:px,y:py,hp,armor}=player;
  if(![px,py,hp,armor,window.minETA,window.maxETA].every(Number.isFinite) || armor<0 || hp<=0 || window.minETA<0 || window.maxETA<window.minETA || window.maxETA<=0)return;
  if(view && (![view.x,view.y,view.width,view.height].every(Number.isFinite)||view.width<=0||view.height<=0))return;
  let best:GuardOpportunity|undefined;
  for(const s of sources) {
    if(!s.active || ![s.x,s.y,s.vx,s.vy,s.life,s.damage,s.delay].every(Number.isFinite) || s.life<=0 || s.damage<=0 || s.delay<0)continue;
    if(view && (s.x<view.x+4||s.y<view.y+4||s.x>view.x+view.width-4||s.y>view.y+view.height-4))continue;
    if(bulwarkPrevented(s.damage,armor)<=0 || Math.max(1,Math.floor(s.damage*.25)-armor)>=hp)continue;
    if(s.kind==='tell' && window.openingBlast) {
      const body=s.body;
      if(!body || ![body.x,body.y,body.radius].every(Number.isFinite) || body.radius<0 || Math.hypot(body.x-px,body.y-py)<=WARDEN_BULWARK_RADIUS+body.radius)continue;
    }
    const duration=Math.min(s.life,window.maxETA-s.delay);
    if(duration<=0)continue;
    const bx=s.x+s.vx*duration/1000,by=s.y+s.vy*duration/1000;
    const entry=segmentCircleEntry(s.x,s.y,bx,by,px,py,PLAYER_PROJECTILE_RADIUS);
    if(entry===null)continue;
    const eta=s.delay+entry*duration;
    if(eta<window.minETA || eta>window.maxETA || best && eta>=best.eta)continue;
    // The real resolver checks walls first, and targets only replace a strictly later hit.
    if(walls.some(w=>{const t=segmentRectEntry(s.x,s.y,bx,by,w);return t!==null&&t<=entry;}))continue;
    best={x:s.x,y:s.y,eta,kind:s.kind};
  }
  return best;
}
