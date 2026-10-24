const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function rig({bpm=120,duration=20,anchor=0}={}){
  const timers=new Map(),scheduled=[];let id=0;
  const window={},performance={now:()=>1000};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/audio'),'utf8'),{window,performance,
    setInterval(fn){timers.set(++id,fn);return id;},clearInterval(key){timers.delete(key);}});
  const p=new window.ScorePlayer(()=>{},()=>{});
  p.load([{pitch:60,start:0,duration:duration*bpm*480/60}],bpm,'piano',null,{metronomeSettings:{firstDownbeat:anchor}});
  p.ctx={currentTime:0};p.context=async()=>p.ctx;p.preparePiano=async()=>{};p.sound=()=>{};
  p.click=(when,level)=>{const entry={when,level,cancelled:false};scheduled.push(entry);p.clicks.add({stop(){if(when>=p.ctx.currentTime)entry.cancelled=true;}});};
  p.metronome=true;return {p,scheduled,timers,live:()=>scheduled.filter(e=>!e.cancelled)};
}
test('重复启用及重复应用设置不会取消紧邻的下一拍',async()=>{
  const r=rig();await r.p.play();r.p.ctx.currentTime=.49;
  r.p.setMetronome(true);r.p.configureMetronome({...r.p.metronomeSettings});
  assert(r.live().some(e=>Math.abs(e.when-.5)<1e-9),'Next beat was cancelled');r.p.stop();
});
test('刚越过拍点续播不会把上一拍挤到当前时刻补响',async()=>{
  const r=rig();r.p.position=.5005;await r.p.play();
  assert(r.live()[0].when>.49,'Previous beat was replayed late');r.p.stop();
});
test('界面停顿超出缓冲后跳过漏拍，不补响成一串',async()=>{
  const r=rig();await r.p.play();r.p.ctx.currentTime=4.51;r.p.tick();
  assert(!r.live().some(e=>Math.abs(e.when-4.51)<1e-9),'Late beat was shifted onto the current time');
  assert(r.live().some(e=>Math.abs(e.when-5)<1e-9));r.p.stop();
});
test('连续快速拖动保持播放意图，最终只播放最后的目标位置',async()=>{
  const r=rig();await r.p.play();await Promise.all([r.p.seek(.2),r.p.seek(.4),r.p.seek(.8)]);
  assert(r.p.playing,'Rapid seek unexpectedly paused playback');assert.equal(r.p.playStart,.8);assert.equal(r.timers.size,1);r.p.stop();
});
test('输出时间戳轻微回摆时可视播放位置不倒退，主动跳转仍可后退',async()=>{
  const r=rig();await r.p.play();r.p.ctx.currentTime=2;
  let stamp=1.7;r.p.ctx.getOutputTimestamp=()=>({contextTime:stamp,performanceTime:1000});
  const before=r.p.playbackSeconds();stamp=1.69;assert(r.p.playbackSeconds()>=before);
  r.p.ctx.getOutputTimestamp=()=>({contextTime:2,performanceTime:1000});await r.p.seek(.5);assert(r.p.playbackSeconds()<before);r.p.stop();
});
test('十分钟模拟时钟和不规则唤醒不会造成累计漂移、重拍或漏拍',async()=>{
  const r=rig({bpm:75,duration:602,anchor:.15});await r.p.play();
  let now=0,index=0;
  while(now<600){now+=index++%71===0?.9:.017+(index%5)*.007;r.p.ctx.currentTime=now;r.p.tick();}
  const events=r.live().filter(e=>e.when<600);assert.equal(events.length,750);
  let error=0;for(let i=0;i<events.length;i++)error=Math.max(error,Math.abs(events[i].when-(.15+i*.8)));
  assert(error<1e-9,`Accumulated grid error: ${error}`);r.p.stop();assert.equal(r.timers.size,0);
});
