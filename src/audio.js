class ScorePlayer {
  constructor(onProgress, onEnd) { this.onProgress=onProgress; this.onEnd=onEnd; this.notes=[]; this.playing=false; this.position=0; this.active=new Set(); this.clicks=new Set(); this.generation=0; this.metronome=false; }
  static pianoCache=new WeakMap();
  pianoRoot(pitch) { return Math.max(21,Math.min(108,21+3*Math.round((pitch-21)/3))); }
  async preparePiano(notes=this.notes) {
    const ctx=this.ctx;
    let cache=ScorePlayer.pianoCache.get(ctx);
    if(!cache){cache=new Map();ScorePlayer.pianoCache.set(ctx,cache);}
    const roots=[...new Set(notes.filter(n=>(n.instrument||this.instrument)==='piano').map(n=>this.pianoRoot(n.pitch)))];
    await Promise.all(roots.map(async root=>{
      if(!cache.has(root))cache.set(root,(async()=>{
        const name=['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'][root%12]+(Math.floor(root/12)-1);
        // XHR supports packaged file:// assets as well as the development page.
        const bytes=await new Promise((resolve,reject)=>{
          const request=new XMLHttpRequest();request.open('GET','assets/piano/'+name+'.mp3');request.responseType='arraybuffer';request.timeout=15000;
          request.onload=()=>request.response&&(request.status===0||request.status===200)?resolve(request.response):reject(Error('钢琴采样读取失败：'+name));
          request.onerror=request.ontimeout=()=>reject(Error('钢琴采样读取失败：'+name));request.send();
        });
        return ctx.decodeAudioData(bytes);
      })().catch(error=>{cache.delete(root);throw error;}));
      const buffer=await cache.get(root);
      if(this.ctx===ctx){if(!this.pianoBuffers||this.pianoContext!==ctx){this.pianoBuffers=new Map();this.pianoContext=ctx;}this.pianoBuffers.set(root,buffer);}
    }));
  }
  async context() { if (!this.ctx) this.ctx=new (window.AudioContext||window.webkitAudioContext)(); await this.ctx.resume(); return this.ctx; }
  playbackSeconds() {
    if(!this.playing||!this.ctx)return this.position;
    // Use the same AudioContext clock as the scheduled clicks. Sampling an
    // output timestamp on every animation frame can jump when UI work stalls.
    const now=this.ctx.currentTime-(this.visualLatency||0);
    const seconds=Math.max(this.playStart||0,Math.min(this.duration,now-this.base));
    this.lastPlaybackSeconds=Math.max(this.lastPlaybackSeconds??this.playStart??0,seconds);
    return this.lastPlaybackSeconds;
  }
  metronomeState(seconds=this.playbackSeconds()) {
    if(!this.notes.length||!this.meter)return null;
    const {num,den,accents}=this.meter;
    const {bpm,firstDownbeat}=this.metronomeSettings;
    const total=(seconds-firstDownbeat)*bpm/60;
    const ordinal=Math.floor(total+1e-9),beat=((ordinal%accents.length)+accents.length)%accents.length;
    return {beat,phase:Math.max(0,Math.min(1,total-ordinal)),
      accents,signature:`${num}/${den}`,bpm,compound:den===8&&num>3&&num%3===0,
      unitLabel:den===8&&num>3&&num%3===0?'♩.':den===8?'♪':den===2?'𝅗𝅥':den===16?'𝅘𝅥𝅯':'♩',
      measure:Math.floor(ordinal/accents.length)+1,seconds,mode:'fixed'};
  }
  configureMetronome(settings={}) {
    const bpm=settings.bpm??this.metronomeDefaults.bpm,firstDownbeat=settings.firstDownbeat??this.metronomeDefaults.firstDownbeat;
    const validTempo=n=>Number.isFinite(n)&&n>=10&&n<=600;
    if(!validTempo(bpm)||!Number.isFinite(firstDownbeat)||firstDownbeat<0||firstDownbeat>86400)
      throw Error('节拍器速度须为 10–600 BPM，首拍时间须为非负秒数。');
    // Ignore legacy tempoChanges too: the metronome always uses one fixed grid.
    if(this.meter.clock&&JSON.stringify(this.metronomeSettings)===JSON.stringify({bpm,firstDownbeat}))return;
    const count=this.meter.accents.length,beats=[];
    for(let ordinal=Math.ceil(-firstDownbeat*bpm/60-1e-9);;ordinal++){
      const seconds=firstDownbeat+ordinal*60/bpm;
      if(seconds>this.duration+1e-9)break;
      const beat=((ordinal%count)+count)%count;
      beats.push({seconds:Math.max(0,seconds),accent:beat===0,level:this.meter.accents[beat],ordinal,
        tick:this.meter.pickup+ordinal*this.meter.unit});
      if(beats.length>200000)throw Error('节拍器时间轴过长，请缩短曲目。');
    }
    this.metronomeSettings={bpm,firstDownbeat};this.meter.clock=this.metronomeSettings;this.beats=beats;
    this.clearClicks();
    if(this.playing){
      const now=this.ctx.currentTime-this.base;
      this.nextBeat=beats.findIndex(b=>b.seconds>=now-1e-9);if(this.nextBeat<0)this.nextBeat=beats.length;this.tick();
    }
  }
  load(notes,bpm,instrument,_beatMap=null,rhythm={}) {
    this.stop();
    const ppq=480,[num,den]=rhythm.timeSignature||[4,4],beat=ppq*4/den*(den===8&&num>3&&num%3===0?3:1);
    const pickup=rhythm.rhythmProcessing?.pickupTicks??0;
    const bar=ppq*4*num/den,last=Math.max(0,rhythm.playbackEndTicks||0,...notes.map(n=>n.start+n.duration));
    const count=Math.round(bar/beat),accents=Array.from({length:count},(_,i)=>i===0?3:count===4&&i===2?2:count===2&&den===8?2:1);
    this.meter={num,den,unit:beat,bar,pickup,accents};
    this.notes=[...notes].sort((a,b)=>a.start-b.start); this.bpm=bpm; this.instrument=instrument;
    this.duration=last*60/(bpm*480);this.position=0;
    this.metronomeDefaults={bpm:bpm/(beat/480),firstDownbeat:pickup*60/(bpm*480)};
    this.configureMetronome(rhythm.metronomeSettings||{});this.onProgress(0,this.duration); }
  async play() { if (this.playing || !this.notes.length) return;
    const generation=this.generation;this.playRequested=true;
    try{const ctx=await this.context();
    if(generation!==this.generation)return;
    await this.preparePiano();
    if(generation!==this.generation||this.playing)return;
    if (this.position>=this.duration) this.position=0; this.playing=true;this.playStart=this.position;this.lastPlaybackSeconds=this.position; this.base=ctx.currentTime-this.position;
    this.visualLatency=Math.max(0,ctx.outputLatency||ctx.baseLatency||0);
    this.next=this.notes.findIndex(n=>n.start*60/(this.bpm*480)>=this.position);
    if (this.next<0) this.next=this.notes.length;
    if (this.position>0) for (const n of this.notes) {
      const begin=n.start*60/(this.bpm*480), end=(n.start+n.duration)*60/(this.bpm*480);
      if (begin<this.position && end>this.position && (n.instrument||this.instrument)!=='drums')
        this.sound(n,ctx.currentTime,end-this.position,this.position-begin);
    }
    this.nextBeat=this.beats.findIndex(beat=>beat.seconds>=this.position-1e-9);if(this.nextBeat<0)this.nextBeat=this.beats.length;
    if(window.ScoreAudioTicker){this.scheduler=window.ScoreAudioTicker();this.scheduler.start(()=>this.tick(),25);}
    else this.timer=setInterval(()=>this.tick(),25);
    this.tick();
    }catch(error){if(generation===this.generation)this.halt();throw error;}
  }
  tick() { if (!this.playing) return; const ctx=this.ctx, now=ctx.currentTime, horizon=now+1.2;
    while (this.next<this.notes.length) { const n=this.notes[this.next], when=this.base+n.start*60/(this.bpm*480); if (when>horizon) break;
      const end=when+n.duration*60/(this.bpm*480),start=Math.max(now,when);
      if(end>now)this.sound(n,start,Math.max(.03,end-start),Math.max(0,start-when));
      this.next++; }
    if(this.metronome)while(this.nextBeat<this.beats.length){
      // Commit clicks further ahead than notes to tolerate short UI stalls.
      const beat=this.beats[this.nextBeat],when=this.base+beat.seconds;if(when>now+3)break;
      if(when>=now-1e-7&&beat.seconds<this.duration-.001)this.click(Math.max(now,when),beat.level);
      this.nextBeat++;
    }
    const elapsed=now-this.base;
    this.position=Math.max(0,Math.min(this.duration,elapsed)); this.onProgress(this.position,this.duration);
    if (elapsed>=this.duration+.08) { this.stop(); this.onEnd(); }
  }
  pause() { if (this.playing)this.position=this.playbackSeconds(); this.halt(); this.onProgress(this.position,this.duration||0); }
  stop() { this.halt(); this.position=0; this.onProgress(0,this.duration||0); }
  seek(seconds) { const was=this.playing||this.playRequested; this.halt();this.playRequested=was; this.position=Math.min(this.duration||0,Math.max(0,seconds)); this.onProgress(this.position,this.duration||0); if (was) return this.play(); }
  halt() { this.generation++;this.playRequested=false;this.scheduler?.stop();this.scheduler=null; if (this.timer) clearInterval(this.timer); this.timer=null; this.playing=false;
    for (const node of this.active) { try { node.stop(); } catch {} } this.active.clear();this.clearClicks(); }
  clearClicks(){for(const node of this.clicks){try{node.stop();}catch{}}this.clicks.clear();}
  setMetronome(enabled){
    if(this.metronome===!!enabled)return;
    this.metronome=!!enabled;this.clearClicks();
    if(this.playing){const seconds=this.ctx.currentTime-this.base;
      this.nextBeat=this.beats.findIndex(beat=>beat.seconds>=seconds-1e-9);if(this.nextBeat<0)this.nextBeat=this.beats.length;this.tick();}
  }
  click(start,accent){
    const level=typeof accent==='boolean'?(accent?3:1):accent;
    const [frequency,volume]=level===3?[1600,.19]:level===2?[1300,.15]:[1050,.12];
    const ctx=this.ctx,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.setValueAtTime(frequency,start);
    gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(volume,start+.002);
    gain.gain.exponentialRampToValueAtTime(.0001,start+.045);osc.connect(gain);gain.connect(ctx.destination);
    osc.onended=()=>{this.clicks.delete(osc);osc.disconnect();gain.disconnect();};this.clicks.add(osc);osc.start(start);osc.stop(start+.05);
  }
  piano(note,start,duration,elapsed){
    const root=this.pianoRoot(note.pitch),buffer=this.pianoBuffers?.get(root);
    if(!buffer)throw Error('钢琴采样尚未加载，请重新点击播放。');
    const rate=2**((note.pitch-root)/12),offset=elapsed*rate;
    if(offset>=buffer.duration)return;
    const ctx=this.ctx,source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.playbackRate.setValueAtTime(rate,start);
    const level=.85*Math.pow((note.velocity??80)/127,1.3),release=.16;
    gain.gain.setValueAtTime(elapsed>0 ? .0001 : level,start);
    if(elapsed>0)gain.gain.linearRampToValueAtTime(level,start+Math.min(.008,duration/2));
    gain.gain.setValueAtTime(level,start+duration);gain.gain.exponentialRampToValueAtTime(.0001,start+duration+release);
    source.connect(gain);gain.connect(ctx.destination);source.onended=()=>{this.active.delete(source);source.disconnect();gain.disconnect();};
    this.active.add(source);source.start(start,offset);source.stop(start+duration+release+.01);
  }
  tone(freq,start,duration,shape,level,sustain=.5,filterFreq=0,decay=2,elapsed=0) {
    const ctx=this.ctx, osc=ctx.createOscillator(), gain=ctx.createGain(); osc.type=shape; osc.frequency.setValueAtTime(freq,start);
    const total=duration+elapsed;
    const attack=Math.min(.012,total/4), settle=Math.min(total,Math.max(attack+.001,Math.min(.12,total*.35)));
    const release=Math.min(.14,Math.max(.06,duration*.12));
    const envelope=age=>age<attack ? level*age/attack : age<settle ?
      level*(1-(1-sustain)*(age-attack)/(settle-attack)) :
      Math.max(.0001,level*sustain*Math.exp(-(age-settle)/decay));
    gain.gain.setValueAtTime(envelope(elapsed),start);
    if(elapsed<attack)gain.gain.linearRampToValueAtTime(level,start+attack-elapsed);
    if(elapsed<settle)gain.gain.linearRampToValueAtTime(level*sustain,start+settle-elapsed);
    if(total>settle)gain.gain.exponentialRampToValueAtTime(envelope(total),start+duration);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration+release);
    if (filterFreq) { const filter=ctx.createBiquadFilter(); filter.type='lowpass';filter.frequency.value=filterFreq;osc.connect(filter);filter.connect(gain); }
    else osc.connect(gain);
    gain.connect(ctx.destination);osc.onended=()=>this.active.delete(osc);
    osc.start(start);osc.stop(start+duration+release+.01);this.active.add(osc);
  }
  noise(start,duration,level,highpass=0) {
    const ctx=this.ctx, len=Math.ceil(ctx.sampleRate*Math.max(duration,.1)), buffer=ctx.createBuffer(1,len,ctx.sampleRate), data=buffer.getChannelData(0);
    for (let i=0;i<len;i++) data[i]=Math.random()*2-1;
    const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=buffer;
    gain.gain.setValueAtTime(level,start);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    if (highpass) { const filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=highpass;src.connect(filter);filter.connect(gain); }
    else src.connect(gain);gain.connect(ctx.destination);src.onended=()=>this.active.delete(src);
    src.start(start);src.stop(start+duration+.01);this.active.add(src);
  }
  sound(note,start,duration,elapsed=0) {
    const freq=440*Math.pow(2,(note.pitch-69)/12), velocity=(note.velocity||80)/127;
    const instrument=note.instrument||this.instrument;
    if (instrument==='drums') {
      if ([35,36].includes(note.pitch)) { this.tone(75,start,.12,'sine',.65*velocity,.08); this.tone(48,start+.025,.1,'sine',.45*velocity,.08); }
      else if ([38,40,37].includes(note.pitch)) { this.noise(start,.17,.3*velocity,950);this.tone(180,start,.08,'triangle',.12*velocity,.08); }
      else if ([42,44,46].includes(note.pitch)) this.noise(start,note.pitch===46?.32:.09,.16*velocity,5500);
      else this.noise(start,.32,.2*velocity,2500);
    } else if (instrument==='piano') {
      this.piano(note,start,duration,elapsed);
    } else if (instrument==='guitar') {
      this.tone(freq,start,duration,'triangle',.32*velocity,.32,2800,1.25,elapsed);
      this.tone(freq*2,start,duration,'sine',.055*velocity,.16,0,.45,elapsed);
    } else {
      this.tone(freq,start,duration,'sine',.44*velocity,.65,0,2.4,elapsed);
      this.tone(freq*2,start,duration,'triangle',.08*velocity,.4,800,.9,elapsed);
    }
  }
}
window.ScorePlayer=ScorePlayer;
