const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function player(){const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/audio.js'),'utf8'),{window,setInterval,clearInterval});return new window.ScorePlayer(()=>{},()=>{});}

test('显示拍位与点击共用谱面位置，弱起不会被误标为第一强拍',()=>{
  const p=player();p.load([{pitch:60,start:0,duration:3840}],120,'piano',null,{timeSignature:[4,4],rhythmProcessing:{pickupTicks:240}});
  let s=p.metronomeState(0);assert.equal(s.measure,0);assert.equal(s.beat,3);assert.equal(s.phase,.5);
  s=p.metronomeState(.25);assert.equal(s.beat,0);assert.equal(s.phase,0);assert.equal(s.accents[s.beat],3);
  s=p.metronomeState(1.25);assert.equal(s.beat,2);assert.equal(s.accents[s.beat],2);
  for(const beat of p.beats)assert.equal(p.metronomeState(beat.seconds).accents[p.metronomeState(beat.seconds).beat],beat.level);
});

test('暂停冻结输出位置，播放显示考虑输出延迟且不倒退到跳转位置之前',async()=>{
  const p=player();p.load([{pitch:60,start:0,duration:3840}],120,'piano');
  p.ctx={currentTime:2,outputLatency:.12};p.visualLatency=.12;p.base=.5;p.playing=true;p.playStart=.8;
  assert(Math.abs(p.playbackSeconds()-1.38)<1e-9);p.pause();const before=p.metronomeState();
  p.ctx.currentTime=8;assert.deepEqual(p.metronomeState(),before);
  await p.seek(.8);p.context=async()=>p.ctx;p.preparePiano=async()=>{};p.sound=()=>{};
  await p.play();assert.equal(p.playbackSeconds(),.8);p.halt();
});

test('仅右手试听的末尾休止保留全谱时长、点击和拍位',()=>{
  const p=player();p.load([{pitch:60,start:0,duration:1920}],120,'piano',null,{timeSignature:[4,4],playbackEndTicks:3840});
  assert.equal(p.duration,4);assert(p.beats.some(b=>b.seconds===3&&b.level===2));
  const s=p.metronomeState(3);assert.equal(s.measure,2);assert.equal(s.beat,2);
});

test('旧版保存的变速段被忽略，校准后始终使用同一固定速度',()=>{
  const p=player();p.load([{pitch:60,start:0,duration:9600}],120,'piano');
  p.configureMetronome({bpm:120,firstDownbeat:.2,tempoChanges:[{measure:2,bpm:240}]});
  assert.equal(p.metronomeState(4.3).bpm,120);assert.equal(p.metronomeState(4.3).mode,'fixed');
  p.configureMetronome({bpm:120,firstDownbeat:.2,tempoChanges:[{measure:3,bpm:90,confirmed:true}]});
  assert.equal(p.metronomeState(4.199).bpm,120);assert.equal(p.metronomeState(4.2).bpm,120);
  assert.equal(p.metronomeState(4.2).beat,0);assert.equal(p.metronomeState(4.2).measure,3);
  assert.equal(p.beats.filter(b=>Math.abs(b.seconds-4.2)<1e-9).length,1);
  for(let i=1;i<p.beats.length;i++)assert(Math.abs(p.beats[i].seconds-p.beats[i-1].seconds-.5)<1e-9);
  assert.equal(JSON.stringify(p.metronomeSettings),JSON.stringify({bpm:120,firstDownbeat:.2}));
  assert.equal(p.metronomeState(8.5).mode,'fixed');
  assert.throws(()=>p.configureMetronome({bpm:0}),/速度/);
});

test('播放中重新校准只替换未来点击，不重启钢琴',()=>{
  const p=player(),clicks=[];let stopped=0;
  p.load([{pitch:60,start:0,duration:3840}],120,'piano');p.ctx={currentTime:.6};p.base=0;p.playing=true;p.next=p.notes.length;
  p.metronome=true;p.active.add({stop(){stopped++;}});p.click=(seconds,level)=>clicks.push({seconds,level});
  p.configureMetronome({bpm:100,firstDownbeat:.2});
  assert.equal(stopped,0);assert(p.playing);assert(Math.abs(clicks[0].seconds-.8)<1e-9);assert(Math.abs(clicks[1].seconds-1.4)<1e-9);
  p.halt();
});

test('开关节拍器不停止钢琴，关闭及暂停清除提前调度的点击',()=>{
  const p=player(),clicks=[];let stoppedPiano=0,stoppedClicks=0;
  p.load([{pitch:60,start:0,duration:3840}],120,'piano');
  p.ctx={currentTime:0};p.base=0;p.playing=true;p.next=p.notes.length;
  p.active.add({stop(){stoppedPiano++;}});
  p.click=(start,accent)=>{clicks.push({start,accent});p.clicks.add({stop(){stoppedClicks++;}});};
  p.setMetronome(true);assert.equal(clicks[0].start,0);assert(clicks.some(n=>n.start===.5));
  assert(clicks.every((n,i)=>!i||n.start-clicks[i-1].start===.5));
  p.setMetronome(false);assert.equal(stoppedClicks,clicks.length);assert.equal(stoppedPiano,0);
  p.ctx.currentTime=.6;p.setMetronome(true);assert(clicks.at(-1).start>=1);
  p.pause();assert.equal(stoppedPiano,1);assert.equal(p.clicks.size,0);assert.equal(p.position,.6);
});

test('加载钢琴采样期间停止或换曲，不会在解码结束后偷跑',async()=>{
  const p=player();p.load([{pitch:60,start:0,duration:480}],120,'piano');
  p.context=async()=>({currentTime:0});let finish,began,started=0;
  const decoding=new Promise(resolve=>{began=resolve;});
  p.preparePiano=()=>new Promise(resolve=>{finish=resolve;began();});p.sound=()=>{started++;};
  const pending=p.play();await decoding;
  p.stop();finish();await pending;assert.equal(p.playing,false);assert.equal(started,0);
});

test('在浮点误差附近跳转到拍点，不会同时恢复和重新触发同一个音',async()=>{
  const p=player(),sounds=[];
  p.load([{pitch:60,start:479.9999999999999,duration:480}],120,'piano');
  p.ctx={currentTime:0};p.context=async()=>p.ctx;p.preparePiano=async()=>{};
  p.position=.5;p.sound=(...args)=>sounds.push(args);
  try{await p.play();assert.equal(sounds.length,1);}finally{p.stop();}
});

test('所有本地钢琴采样均与清单哈希一致，覆盖 A0 至 C8',()=>{
  const crypto=require('node:crypto'),dir=path.join(__dirname,'../src/assets/piano');
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
  assert.equal(manifest.samples.length,30);assert.equal(manifest.samples[0].midi,21);assert.equal(manifest.samples.at(-1).midi,108);
  for(const sample of manifest.samples){const buffer=fs.readFileSync(path.join(dir,sample.file));assert.equal(buffer.length,sample.bytes);assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'),sample.sha256);}
});
