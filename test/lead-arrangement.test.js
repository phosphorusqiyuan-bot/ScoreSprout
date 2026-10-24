const test=require('node:test'),assert=require('node:assert/strict');
const {buildLeftHand}=require('../src/lead-arrangement');
const {generateVersion,versionToMidi,analyzeMidi}=require('../src/midi');
const {versionToMusicXML}=require('../src/musicxml');
const {applyPianoDifficulty}=require('../src/piano-difficulty');
const note=(pitch,start,duration=120)=>({pitch,start,duration,velocity:80,hand:'right'});

test('伴奏按拍与弱起编写，较长主唱休止内不增加左手，未知和弦不强行猜测',()=>{
  const melody=[note(72,240,480),note(74,720,480),note(76,2880,480)];
  const chords=[{start:0,end:8,label:'C:maj'}];
  const options={toTick:s=>s*480,meter:[4,4],pickupTicks:240,style:'fifth',difficulty:'beginner'};
  const result=buildLeftHand(chords,melody,options);
  assert(result.notes.length>1);assert(result.notes.every(n=>n.hand==='left'&&n.duration%30===0));
  assert(result.notes.every(n=>n.start+n.duration<=1200||n.start>=2880));
  assert.equal(buildLeftHand([{start:0,end:8,label:'C:nonsense'}],melody,options).notes.length,0);
  assert.equal(buildLeftHand(chords,melody,{...options,style:'off'}).notes.length,0);
  const doubled=buildLeftHand([{start:0,end:4,label:'C:maj'}],melody,{...options,toTick:s=>s*960});
  assert.deepEqual(doubled.notes,result.notes);
});

test('和弦连接受音区、跨度及右手音区限制，新手每只手最多一个键',()=>{
  const chords=[{start:0,end:2,label:'C:maj'},{start:2,end:4,label:'F:maj'},{start:4,end:6,label:'G:maj'}];
  const melody=[note(64,0,2880)];
  const result=buildLeftHand(chords,melody,{toTick:s=>s*480,style:'voiced',difficulty:'full'});
  const starts=[...new Set(result.notes.map(n=>n.start))];
  assert(starts.length>2);
  for(const start of starts){
    const pitches=result.notes.filter(n=>n.start===start).map(n=>n.pitch);
    assert(pitches.length<=3);assert(Math.max(...pitches)-Math.min(...pitches)<=12);
    assert(Math.max(...pitches)<64-2);
  }
  const collision=buildLeftHand(chords,[note(39,0,2880)],{toTick:s=>s*480});
  assert.equal(collision.notes.length,0);assert(collision.stats.skippedCollisions>0);
});

test('自动左手不在和弦边界生成三十二分、六十四分根音碎片',()=>{
  const chords=[{start:0,end:1.0625,label:'C:maj'},{start:1.0625,end:3,label:'G:maj'}];
  const result=buildLeftHand(chords,[note(72,0,1920)],{toTick:s=>s*480,style:'fifth',difficulty:'full'});
  assert(result.stats.skippedShortFragments>0);assert(result.notes.length>0);
  assert(result.notes.every(note=>note.duration>=120));
});

test('主唱版的新伴奏经过分手简化后仍可导出',()=>{
  const source={inputType:'mp3',sourcePpq:480,bpm:120,audioBaseBpm:120,title:'后续验收',
    timeSignature:[4,4],keyFifths:0,keyMode:0,tracks:[{id:'vocal',name:'人声',role:'vocal_melody',
      notes:[note(72,0,480),note(84,480),note(72,600,480),note(74,2400,480)]}],
    audioAnalysis:{chords:'0\t6\tC:maj'}};
  for(const difficulty of ['full','intermediate','beginner']){
    const v=generateVersion(source,['vocal'],'piano',difficulty,source.title,false,
      {deferPianoDifficulty:true,settings:{mode:'vocal',leftStyle:'voiced'}});
    applyPianoDifficulty(v);
    assert.equal(v.accompanimentProcessing.style,'voiced');
    const right=v.notes.filter(n=>n.hand==='right');
    assert.deepEqual(right.map(n=>n.pitch),[72,84,72,74]);
    assert.equal(right.length,4);
    if(difficulty==='beginner')for(const n of v.notes)assert(v.notes.filter(other=>
      n.hand===other.hand&&other.start<=n.start&&other.start+other.duration>n.start).length<=1);
    assert.match(versionToMusicXML(v),/<staves>2<\/staves>/);
    assert.equal(analyzeMidi(versionToMidi(v),'test.mid').tracks.reduce((n,t)=>n+t.notes.length,0),v.notes.length);
  }
});
