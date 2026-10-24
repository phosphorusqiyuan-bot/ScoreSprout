const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('长音自然衰减，记谱结束前保持可听尾音',()=>{
  const window={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','src','audio.js'),'utf8'),{window});
  const events=[],stops=[];
  const ctx={
    destination:{},
    createOscillator:()=>({
      frequency:{setValueAtTime(){}},connect(){},start(){},stop(time){stops.push(time);}
    }),
    createGain:()=>({
      gain:{
        setValueAtTime(value,time){events.push({kind:'set',value,time});},
        linearRampToValueAtTime(value,time){events.push({kind:'linear',value,time});},
        exponentialRampToValueAtTime(value,time){events.push({kind:'exponential',value,time});}
      },
      connect(){}
    })
  };
  const player=new window.ScorePlayer(()=>{},()=>{});
  player.ctx=ctx;
  player.tone(440,2,3,'sine',.5,.6);
  const settled=events.find(e=>e.kind==='linear'&&e.value===.3);
  const tail=events.find(e=>e.kind==='exponential'&&e.time===5);
  assert(tail.value>0.01 && tail.value<settled.value*.3);
  assert(events.some(e=>e.kind==='exponential'&&e.time>5));
  assert(stops[0]>5);
});

test('钢琴使用录音采样；跳转到长音中间读取对应偏移，不重新敲击',()=>{
  const window={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','src','audio.js'),'utf8'),{window});
  const gains=[],sources=[];
  const player=new window.ScorePlayer(()=>{},()=>{});
  player.instrument='piano';
  player.pianoBuffers=new Map([[69,{duration:10}]]);
  player.ctx={destination:{},createOscillator:()=>{throw Error('piano must not use oscillators');},
    createBufferSource:()=>{const source={playbackRate:{setValueAtTime(){}},connect(){},start(...args){source.started=args;},stop(){}};sources.push(source);return source;},
    createGain:()=>{const events=[];gains.push(events);return {connect(){},gain:{
      setValueAtTime(value,time){events.push({kind:'set',value,time});},
      linearRampToValueAtTime(value,time){events.push({kind:'linear',value,time});},
      exponentialRampToValueAtTime(value,time){events.push({kind:'exponential',value,time});}
    }};}};
  player.sound({pitch:69,velocity:127},0,2,3);
  assert.deepEqual(sources[0].started,[0,3]);
  assert.equal(gains[0][0].value,.0001);
  assert(gains[0].some(event=>event.kind==='linear'&&event.time<=.008));
  assert.equal(player.active.size,1);
});
test('播放到曲末后自动停止并通知界面',()=>{
  const window={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','src','audio.js'),'utf8'),{window});
  let ended=0;
  const player=new window.ScorePlayer(()=>{},()=>{ended++;});
  player.ctx={currentTime:10};player.base=8.8;player.duration=1;
  player.notes=[{start:0,duration:480,pitch:60,velocity:80}];
  player.next=player.notes.length;player.playing=true;
  player.tick();
  assert.equal(ended,1);assert.equal(player.playing,false);assert.equal(player.position,0);
});
test('提前安排音符，谱面更新稍慢时仍保持原始拍点',()=>{
  const window={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','src','audio.js'),'utf8'),{window});
  const scheduled=[];
  const player=new window.ScorePlayer(()=>{},()=>{});
  player.ctx={currentTime:0};player.base=0;player.bpm=120;player.duration=2;player.playing=true;
  player.notes=[{start:480,duration:120,pitch:60},{start:960,duration:120,pitch:62}];
  player.next=0;player.sound=(note,start)=>scheduled.push([note.pitch,start]);
  player.tick();
  assert.deepEqual(scheduled,[[60,.5],[62,1]]);
  assert.equal(player.next,2);
});
