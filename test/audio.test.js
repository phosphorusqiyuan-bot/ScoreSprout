const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('长音在整个记谱时值内保持可听电平',()=>{
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
  assert(events.some(e=>e.kind==='set'&&e.time===5&&e.value>=.25));
  assert(events.some(e=>e.kind==='exponential'&&e.time>5));
  assert(stops[0]>5);
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
