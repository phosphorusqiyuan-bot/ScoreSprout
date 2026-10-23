const test=require('node:test');
const assert=require('node:assert/strict');
const {generateVersion,analyzeMidi,versionToMidi}=require('../src/midi');
const {versionToMusicXML}=require('../src/musicxml');

function version(notes) {
  const source={title:'节拍整理',sourcePpq:480,bpm:120,timeSignature:[4,4],keyFifths:0,keyMode:0,
    tracks:[{id:'piano',name:'钢琴',detected:'piano',notes:notes.map(note=>({velocity:80,hand:'right',...note}))}]};
  return generateVersion(source,['piano'],'piano','full',source.title);
}

// Independently read MusicXML's forward position, backups, chords and ties.
// Reconstructing the notes catches a voice that changes playback timing.
function readNotes(xml) {
  const result=[],pending=new Map(),pitchClass={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  for(const part of xml.matchAll(/<part id="([^"]+)">([\s\S]*?)<\/part>/g)) {
    let offset=0;
    for(const measure of part[2].matchAll(/<measure[^>]*>([\s\S]*?)<\/measure>/g)) {
      let position=0,lastStart=0;
      for(const match of measure[1].matchAll(/<note(?:\s[^>]*)?>[\s\S]*?<\/note>|<backup>[\s\S]*?<\/backup>/g)) {
        const token=match[0],duration=Number(token.match(/<duration>(\d+)<\/duration>/)[1]);
        if(token.startsWith('<backup>')){position-=duration;assert(position>=0);continue;}
        const start=token.includes('<chord/>')?lastStart:position;
        if(!token.includes('<chord/>')){position+=duration;lastStart=start;}
        assert(position<=1920);
        const step=token.match(/<step>([A-G])<\/step>/)?.[1];
        if(!step)continue;
        const pitch=pitchClass[step]+Number(token.match(/<alter>(-?\d+)<\/alter>/)?.[1]||0)+
          12*(Number(token.match(/<octave>(\d+)<\/octave>/)[1])+1);
        const voice=token.match(/<voice>(\d+)<\/voice>/)[1],key=`${part[1]}:${voice}:${pitch}`;
        let note;
        if(token.includes('<tie type="stop"/>')) {
          note=pending.get(key);assert(note);assert.equal(note.start+note.duration,offset+start);note.duration+=duration;
        }else {note={pitch,start:offset+start,duration};result.push(note);}
        if(token.includes('<tie type="start"/>'))pending.set(key,note);else pending.delete(key);
      }
      assert.equal(position,1920);offset+=1920;
    }
  }
  assert.equal(pending.size,0);
  return result.sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
}

function assertScoreMatchesPlayback(v) {
  const expected=v.notes.map(({pitch,start,duration})=>({pitch,start,duration}));
  assert.deepEqual(readNotes(versionToMusicXML(v)),expected);
  const midi=analyzeMidi(versionToMidi(v),'export.mid');
  assert.deepEqual(midi.tracks.flatMap(track=>track.notes).map(({pitch,start,duration})=>({pitch,start,duration}))
    .sort((a,b)=>a.start-b.start||a.pitch-b.pitch),expected);
}

test('同手的长音不会被另一声部的短音反复切碎，跨小节仍正确连音',()=>{
  const v=version([{pitch:72,start:0,duration:2880},
    ...Array.from({length:8},(_,i)=>({pitch:76+i%3,start:i*480,duration:480}))]);
  const xml=versionToMusicXML(v);
  assert.doesNotMatch(xml,/<type>(?:32nd|64th)<\/type>/);
  assert.match(xml,/<duration>1920<\/duration>[\s\S]*?<type>whole<\/type>/);
  assert.equal((xml.match(/<tie type="start"\/>/g)||[]).length,1);
  assertScoreMatchesPlayback(v);
});

test('附点时值直接写成附点音符，不拆成多个连音',()=>{
  const v=version([{pitch:72,start:0,duration:720},{pitch:74,start:720,duration:240},
    {pitch:76,start:960,duration:960}]);
  const xml=versionToMusicXML(v);
  assert.match(xml,/<type>quarter<\/type><dot\/>/);
  assert.doesNotMatch(xml,/<tie /);
  assertScoreMatchesPlayback(v);
});

test('稳定节拍上的轻微起音误差和短空隙会整理，避免细碎音符和休止',()=>{
  const v=version([8,486,953,1447].map((start,i)=>({pitch:72+i,start,duration:390})));
  assert.deepEqual(v.notes.map(note=>note.start),[0,480,960,1440]);
  assert(v.notes.slice(0,3).every(note=>note.duration===480));
  assert.doesNotMatch(versionToMusicXML(v),/<type>(?:32nd|64th)<\/type>/);
  assertScoreMatchesPlayback(v);
});

test('真正的短音和明显的休止不会被节拍整理抹掉',()=>{
  const fast=version(Array.from({length:33},(_,i)=>({pitch:72+i%5,start:i*30,duration:30})));
  assert.equal(fast.notes.length,33);
  assert(fast.notes.every(note=>note.duration===30));
  assert.match(versionToMusicXML(fast),/<type>64th<\/type>/);
  assertScoreMatchesPlayback(fast);
  const detached=version([0,480,960,1440].map(start=>({pitch:72,start,duration:120})));
  assert(detached.notes.every(note=>note.duration===120));
  assertScoreMatchesPlayback(detached);
});
