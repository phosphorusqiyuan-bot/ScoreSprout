class ScorePlayer {
  constructor(onProgress, onEnd) { this.onProgress=onProgress; this.onEnd=onEnd; this.notes=[]; this.playing=false; this.position=0; this.active=[]; }
  async context() { if (!this.ctx) this.ctx=new (window.AudioContext||window.webkitAudioContext)(); await this.ctx.resume(); return this.ctx; }
  load(notes,bpm,instrument) { this.stop(); this.notes=[...notes].sort((a,b)=>a.start-b.start); this.bpm=bpm; this.instrument=instrument;
    this.duration=this.notes.length ? Math.max(...this.notes.map(n=>n.start+n.duration))*60/(bpm*480) : 0; this.position=0; this.onProgress(0,this.duration); }
  async play() { if (this.playing || !this.notes.length) return; const ctx=await this.context();
    if (this.position>=this.duration) this.position=0; this.playing=true; this.base=ctx.currentTime-this.position; this.next=this.notes.findIndex(n=>n.start*60/(this.bpm*480)>=this.position-.001);
    if (this.next<0) this.next=this.notes.length;
    if (this.position>0) for (const n of this.notes) {
      const begin=n.start*60/(this.bpm*480), end=(n.start+n.duration)*60/(this.bpm*480);
      if (begin<this.position && end>this.position && (n.instrument||this.instrument)!=='drums')
        this.sound(n,ctx.currentTime,end-this.position);
    }
    this.timer=setInterval(()=>this.tick(),40); this.tick(); }
  tick() { if (!this.playing) return; const ctx=this.ctx, now=ctx.currentTime, horizon=now+.22;
    while (this.next<this.notes.length) { const n=this.notes[this.next], when=this.base+n.start*60/(this.bpm*480); if (when>horizon) break;
      if (when>=now-.04) this.sound(n,Math.max(now,when),Math.max(.05,n.duration*60/(this.bpm*480))); this.next++; }
    const elapsed=now-this.base;
    this.position=Math.max(0,Math.min(this.duration,elapsed)); this.onProgress(this.position,this.duration);
    if (elapsed>=this.duration+.08) { this.stop(); this.onEnd(); }
  }
  pause() { if (!this.playing) return; this.position=Math.min(this.duration,this.ctx.currentTime-this.base); this.halt(); this.onProgress(this.position,this.duration); }
  stop() { this.halt(); this.position=0; this.onProgress(0,this.duration||0); }
  seek(seconds) { const was=this.playing; this.halt(); this.position=Math.min(this.duration||0,Math.max(0,seconds)); this.onProgress(this.position,this.duration||0); if (was) this.play(); }
  halt() { if (this.timer) clearInterval(this.timer); this.timer=null; this.playing=false;
    for (const node of this.active) { try { node.stop(); } catch {} } this.active=[]; }
  tone(freq,start,duration,shape,level,sustain=.5,filterFreq=0) {
    const ctx=this.ctx, osc=ctx.createOscillator(), gain=ctx.createGain(); osc.type=shape; osc.frequency.setValueAtTime(freq,start);
    const attack=Math.min(.012,duration/4), settle=Math.min(duration,Math.max(attack+.001,Math.min(.12,duration*.35)));
    const release=Math.min(.14,Math.max(.06,duration*.12));
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(level,start+attack);
    gain.gain.linearRampToValueAtTime(level*sustain,start+settle);
    gain.gain.setValueAtTime(level*sustain,start+duration);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration+release);
    if (filterFreq) { const filter=ctx.createBiquadFilter(); filter.type='lowpass';filter.frequency.value=filterFreq;osc.connect(filter);filter.connect(gain); }
    else osc.connect(gain);
    gain.connect(ctx.destination);osc.start(start);osc.stop(start+duration+release+.01);this.active.push(osc);
  }
  noise(start,duration,level,highpass=0) {
    const ctx=this.ctx, len=Math.ceil(ctx.sampleRate*Math.max(duration,.1)), buffer=ctx.createBuffer(1,len,ctx.sampleRate), data=buffer.getChannelData(0);
    for (let i=0;i<len;i++) data[i]=Math.random()*2-1;
    const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=buffer;
    gain.gain.setValueAtTime(level,start);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    if (highpass) { const filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=highpass;src.connect(filter);filter.connect(gain); }
    else src.connect(gain);gain.connect(ctx.destination);src.start(start);src.stop(start+duration+.01);this.active.push(src);
  }
  sound(note,start,duration) {
    const freq=440*Math.pow(2,(note.pitch-69)/12), velocity=(note.velocity||80)/127;
    const instrument=note.instrument||this.instrument;
    if (instrument==='drums') {
      if ([35,36].includes(note.pitch)) { this.tone(75,start,.12,'sine',.65*velocity,.08); this.tone(48,start+.025,.1,'sine',.45*velocity,.08); }
      else if ([38,40,37].includes(note.pitch)) { this.noise(start,.17,.3*velocity,950);this.tone(180,start,.08,'triangle',.12*velocity,.08); }
      else if ([42,44,46].includes(note.pitch)) this.noise(start,note.pitch===46?.32:.09,.16*velocity,5500);
      else this.noise(start,.32,.2*velocity,2500);
    } else if (instrument==='piano') { this.tone(freq,start,duration,'triangle',.27*velocity,.45); this.tone(freq*2,start,duration,'sine',.075*velocity,.25); }
    else if (instrument==='guitar') { this.tone(freq,start,duration,'triangle',.32*velocity,.32,2800); this.tone(freq*2,start,duration,'sine',.055*velocity,.16); }
    else { this.tone(freq,start,duration,'sine',.44*velocity,.65); this.tone(freq*2,start,duration,'triangle',.08*velocity,.4,800); }
  }
}
window.ScorePlayer=ScorePlayer;
