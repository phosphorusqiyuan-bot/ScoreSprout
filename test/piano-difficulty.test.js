const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeMidi,generateVersion,versionToMidi}=require('../src/midi');
const {versionToMusicXML}=require('../src/musicxml');
const {applyPianoDifficulty}=require('../src/piano-difficulty');

const melody=[72,74,76,74,72,71,69,71,72,74,76,79,77,76,74,72];
const notes=melody.flatMap((pitch,index)=>[
  {pitch,start:index*120,duration:180,velocity:90,hand:'right'},
  ...(index%4===0?[{pitch:pitch-5,start:index*120,duration:360,velocity:60,hand:'right'}]:[]),
  ...(index%2===0?[{pitch:[48,55,52,55][index/2%4],start:index*120,duration:120,velocity:65,hand:'left'}]:[])
]);
const source={title:'连续十六分旋律',sourcePpq:480,bpm:120,timeSignature:[4,4],keyFifths:0,keyMode:0,
  tracks:[{id:'piano',name:'钢琴',detected:'piano',notes}]};

function make(difficulty,options) {
  return generateVersion(source,['piano'],'piano',difficulty,source.title,{},options);
}
function melodySurvives(version) {
  for(const [index,pitch] of melody.entries())
    assert(version.notes.some(note=>note.hand==='right'&&note.pitch===pitch&&note.start===index*120));
}
function maxPolyphony(notes) {
  return Math.max(0,...notes.map(note=>notes.filter(other=>other.start<=note.start&&other.start+other.duration>note.start).length));
}

test('钢琴新手版保留每个旋律起音，双手各最多一个键，左手重复低音合成长音',()=>{
  const version=make('beginner');
  melodySurvives(version);
  const right=version.notes.filter(note=>note.hand==='right'),left=version.notes.filter(note=>note.hand==='left');
  assert.equal(right.length,melody.length);
  assert.equal(maxPolyphony(right),1);
  assert.equal(maxPolyphony(left),1);
  assert(left.length<=2);
  assert(left.some(note=>note.duration>=960));
  assert(left.every(note=>note.pitch>=40&&note.pitch<=59));
  assert.match(versionToMusicXML(version),/<staves>2<\/staves>/);
  const exported=analyzeMidi(versionToMidi(version),'beginner.mid');
  assert.equal(exported.tracks.length,2);
  assert.equal(exported.tracks.reduce((total,track)=>total+track.notes.length,0),version.notes.length);
});

test('钢琴进阶版保留同一段完整旋律并允许双音，完整版保留原始和弦及延音',()=>{
  const beginner=make('beginner'),intermediate=make('intermediate'),full=make('full');
  melodySurvives(intermediate);
  assert.equal(maxPolyphony(intermediate.notes.filter(note=>note.hand==='right')),2);
  assert(maxPolyphony(intermediate.notes.filter(note=>note.hand==='left'))<=2);
  assert(intermediate.notes.filter(note=>note.hand==='left').length>beginner.notes.filter(note=>note.hand==='left').length);
  assert.deepEqual(full.notes.map(({pitch,start,duration})=>({pitch,start,duration})),
    [...notes].sort((a,b)=>a.start-b.start||a.pitch-b.pitch).map(({pitch,start,duration})=>({pitch,start,duration})));
});

test('应用生成流程在分手后简化，并同步声部、试听及导出的音符',()=>{
  const version=make('beginner',{deferPianoDifficulty:true});
  assert.equal(version.notes.length,notes.length);
  assert.equal(version.pianoDifficultyPending,true);
  // Hand predictions have been applied to the full input at this stage.
  applyPianoDifficulty(version);
  assert.equal(version.pianoDifficultyPending,undefined);
  melodySurvives(version);
  assert.deepEqual(version.notes,version.parts[0].notes);
  const before=JSON.stringify(version.notes);
  applyPianoDifficulty(version);
  assert.equal(JSON.stringify(version.notes),before);
});

test('MP3 新手钢琴保留快速右手旋律，预测和弦只生成简单左手低音',()=>{
  const input={...source,inputType:'mp3',tracks:[{...source.tracks[0],name:'人声旋律',
    notes:notes.filter(note=>note.hand==='right')}],audioAnalysis:{
    chords:'0\t2\tC:maj',beats:'0\t1\t4\t4\n0.5\t2\t4\t4\n1\t3\t4\t4\n1.5\t4\t4\t4'
  }};
  const version=generateVersion(input,['piano'],'piano','beginner',input.title);
  melodySurvives(version);
  assert(version.mp3PianoAccompaniment);
  const left=version.notes.filter(note=>note.hand==='left');
  assert(left.length>0&&left.length<=2);
  assert.equal(maxPolyphony(left),1);
});

test('三拍子新手左手每小节一个低音，并保留原有长休止',()=>{
  const input={...source,timeSignature:[3,4],tracks:[{...source.tracks[0],notes:[
    ...notes.filter(note=>note.hand==='right'),
    ...[0,480,960,2880].map(start=>({pitch:48,start,duration:120,velocity:60,hand:'left'}))
  ]}]};
  const version=generateVersion(input,['piano'],'piano','beginner',input.title);
  const left=version.notes.filter(note=>note.hand==='left');
  assert.equal(left.length,2);
  assert.equal(left[0].start,0);
  assert.equal(left[1].start,2880);
  assert(left[0].start+left[0].duration<left[1].start);
});
