import type { ClassId } from '../data/classes';
export type Sfx = 'attack' | 'hit' | 'crit' | 'kill' | 'dash' | 'skill' | 'hurt' | 'combo' | 'victory' | 'break' | 'parry' | 'tell';
const LENGTH:Record<Sfx,number>={attack:0.13,hit:0.09,crit:0.17,kill:0.2,dash:0.18,skill:0.48,hurt:0.2,combo:0.36,victory:1.05,break:0.38,parry:0.24,tell:0.34};

/** Deterministic original PCM, no network/media license dependency. Also used by offline audio tests. */
export function renderCombatSound(type:Sfx,id:ClassId,chain=0,rate=22050):Float32Array {
  const duration=LENGTH[type],out=new Float32Array(Math.ceil(duration*rate));
  const color={warden:0.78,reaver:0.95,shade:1.7,thorn:1.3}[id];
  let random=0x51eed,phase=0,prior=0,peak=0;
  for(let i=0;i<out.length;i++) {
    const t=i/rate,u=t/duration,attack=Math.min(1,t/0.003),tail=(1-u)**2;
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    const noise=random/2147483648-1,air=noise-prior;prior=noise;
    let sample=0;
    if(type==='attack'){
      const f=(id==='warden'?165:id==='shade'?950:460)*(1-u*0.8);phase+=f/rate;
      sample=(Math.sin(phase*Math.PI*2)*0.24+air*0.19)*(1-u)**2;
      if(id==='reaver')sample*=0.7+0.3*Math.cos(t*100);
    }else if(type==='hit'||type==='crit'){
      const force=type==='crit'?1.5:1;
      sample=(air*0.3*Math.exp(-t*42)+Math.sin(t*2*Math.PI*(92*color))*0.55*Math.exp(-t*35))*force;
    }else if(type==='kill'){
      sample=air*0.16*Math.exp(-t*18)+Math.sin(t*2*Math.PI*90)*0.4*Math.exp(-t*30)+Math.sin(t*2*Math.PI*440*2**(Math.min(7,chain)/12))*0.18*tail;
    }else if(type==='dash'){
      sample=air*0.21*Math.sin(Math.PI*u)+Math.sin(t*2*Math.PI*(180+u*150))*0.05*tail;
    }else if(type==='hurt'){
      phase+=(125-70*u)/rate;
      sample=(Math.sin(phase*2*Math.PI)*0.45+noise*0.12)*tail;
    }else if(type==='parry'){
      const f=1100*(1-u*0.7);phase+=f/rate;
      sample=(Math.sin(phase*2*Math.PI)*0.28+air*0.18)*Math.exp(-t*15);
      if(t>0.025)sample+=Math.sin((t-0.025)*2*Math.PI*1760)*0.18*Math.exp(-(t-0.025)*18);
    }else if(type==='tell'){
      phase+=(96+u*32)/rate;
      const pulse=0.55+0.45*Math.cos(u*Math.PI*6);
      sample=(Math.sin(phase*2*Math.PI)*0.28+noise*0.035)*pulse*tail;
    }else if(type==='break'){
      phase+=(165-90*u)/rate;
      sample=air*0.31*Math.exp(-t*19)+Math.sin(phase*2*Math.PI)*0.4*Math.exp(-t*9);
      sample+=Math.sin(t*2*Math.PI*587.33)*0.17*Math.exp(-t*10);
    }else if(type==='skill'){
      phase+=(id==='shade'?650+u*1300:id==='thorn'?230+u*800:75+u*20)/rate;
      sample=Math.sin(phase*2*Math.PI)*0.35*tail+air*0.12*Math.exp(-t*15);
      const ring=id==='warden'?330:id==='reaver'?196:id==='shade'?990:660;
      sample+=Math.sin(t*2*Math.PI*ring)*0.14*Math.exp(-t*7);
      if(id==='reaver')sample+=Math.sin(t*2*Math.PI*66)*0.22*tail;
    }else{
      const notes=type==='victory'?[220,261.63,329.63,440]:[440,554.37,659.25];
      const spacing=type==='victory'?0.13:0.065;
      notes.forEach((f,j)=>{const since=t-j*spacing;if(since>=0)sample+=Math.sin(since*2*Math.PI*f)*(1+0.12*Math.sin(since*2*Math.PI*f*2))*Math.exp(-since*6)*0.19;});
      if(type==='victory')sample+=Math.sin(t*2*Math.PI*55)*Math.exp(-t*5)*0.25;
      sample*=tail;
    }
    sample*=attack*Math.min(1,(duration-t)/0.012);out[i]=sample;peak=Math.max(peak,Math.abs(sample));
  }
  if(peak>0.86)for(let i=0;i<out.length;i++)out[i]*=0.86/peak;
  return out;
}

/** Scene-local, gesture-unlocked audio; bounded voices, limiter, mute, visibility & lifecycle safe. */
export class CombatAudio {
  private context?:AudioContext;
  private master?:GainNode;
  private limiter?:DynamicsCompressorNode;
  private analyser?:AnalyserNode;
  private buffers=new Map<string,AudioBuffer>();
  private voices=new Set<AudioBufferSourceNode>();
  private last=new Map<Sfx,number>();
  private suspended=false;
  private disposed=false;
  private onGesture=()=>{void this.unlock();};
  private onVisibility=()=>{this.refreshVolume();if(document.hidden)this.stopVoices();};
  constructor(private volume:()=>number) {
    document.addEventListener('pointerdown',this.onGesture,{passive:true});
    document.addEventListener('keydown',this.onGesture);
    document.addEventListener('visibilitychange',this.onVisibility);
  }
  get activeVoices():number{return this.voices.size;}
  get state():string{return this.context?.state??'locked';}
  async unlock():Promise<void> {
    if(this.disposed)return;
    try {
      if(!this.context){
        const AudioCtor=window.AudioContext??(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
        if(!AudioCtor)return;
        this.context=new AudioCtor();this.master=this.context.createGain();this.limiter=this.context.createDynamicsCompressor();
        this.limiter.threshold.value=-12;this.limiter.knee.value=12;this.limiter.ratio.value=8;this.limiter.attack.value=0.003;this.limiter.release.value=0.09;
        this.analyser=this.context.createAnalyser();this.analyser.fftSize=256;
        this.master.connect(this.limiter);this.limiter.connect(this.analyser);this.analyser.connect(this.context.destination);this.refreshVolume();
      }
      if(this.context.state==='suspended')await this.context.resume();
    }catch{/* Audio is optional: blocked / unsupported devices retain playable combat. */}
  }
  play(type:Sfx,id:ClassId,chain=0,pan=0):void {
    const ctx=this.context;if(this.disposed||this.suspended||document.hidden||!ctx||ctx.state!=='running'||this.volume()<=0)return;
    const now=ctx.currentTime,minimum=type==='hit'||type==='kill'?0.045:type==='attack'?0.075:0.09;
    if(now-(this.last.get(type)??-Infinity)<minimum)return;
    this.last.set(type,now);
    const key=`${type}:${id}:${type==='kill'?Math.min(7,chain):0}`;
    let buffer=this.buffers.get(key);
    if(!buffer){const pcm=renderCombatSound(type,id,chain,ctx.sampleRate);buffer=ctx.createBuffer(1,pcm.length,ctx.sampleRate);buffer.getChannelData(0).set(pcm);this.buffers.set(key,buffer);}
    if(this.voices.size>=16){const oldest=this.voices.values().next().value;oldest?.stop();if(oldest)this.voices.delete(oldest);}
    const source=ctx.createBufferSource(),panner=ctx.createStereoPanner();source.buffer=buffer;panner.pan.value=Math.max(-0.7,Math.min(0.7,pan));
    source.connect(panner);panner.connect(this.master!);this.voices.add(source);
    source.onended=()=>{this.voices.delete(source);source.disconnect();panner.disconnect();};source.start();
  }
  refreshVolume():void {if(this.master&&this.context)this.master.gain.setTargetAtTime(this.suspended||document.hidden?0:Math.max(0,Math.min(1,this.volume()))*0.65,this.context.currentTime,0.012);}
  setSuspended(flag:boolean):void {this.suspended=flag;if(flag)this.stopVoices();this.refreshVolume();}
  energy():number {if(!this.analyser)return 0;const a=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(a);return Math.sqrt(a.reduce((sum,v)=>sum+v*v,0)/a.length);}
  private stopVoices():void {for(const v of this.voices){try{v.stop();}catch{}}this.voices.clear();}
  destroy():void {
    this.disposed=true;document.removeEventListener('pointerdown',this.onGesture);document.removeEventListener('keydown',this.onGesture);document.removeEventListener('visibilitychange',this.onVisibility);
    this.stopVoices();this.buffers.clear();this.master?.disconnect();this.limiter?.disconnect();this.analyser?.disconnect();void this.context?.close().catch(()=>{});
  }
}
