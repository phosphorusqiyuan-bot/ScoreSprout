const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {versionToMusicXML:rawMusicXML}=require('../src/musicxml');
const {layoutMusicXML}=require('../src/score-layout');
const versionToMusicXML=value=>layoutMusicXML(rawMusicXML(value));
const {analyzeMidi,generateVersion,versionToMidi}=require('../src/midi');

// Read sounding events from the exported MusicXML, independently of the
// spelling algorithm. Merge ties, and account for chords, measures and backups.
function soundingEvents(xml,meter=[4,4]) {
  const events=[],tied=new Map(),measureTicks=480*4*meter[0]/meter[1];
  const tag=(value,name)=>value.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];
  for(const [partIndex,part] of [...xml.matchAll(/<part id="[^"]+">([\s\S]*?)<\/part>/g)].entries()) {
    for(const [measureIndex,match] of [...part[1].matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)].entries()) {
      let cursor=measureIndex*measureTicks,lastStart=cursor;
      for(const token of match[1].matchAll(/<(note|backup|forward)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
        const value=token[2],duration=Number(tag(value,'duration'));
        if(token[1]==='backup'){cursor-=duration;continue;}
        if(token[1]==='forward'){cursor+=duration;continue;}
        const start=value.includes('<chord/>')?lastStart:cursor;
        if(!value.includes('<chord/>')){lastStart=start;cursor+=duration;}
        assert(cursor<= (measureIndex+1)*measureTicks,'voice overfills a measure');
        if(value.includes('<rest'))continue;
        const pitch=value.includes('<unpitched>')?Number(value.match(/<instrument id="D(\d+)"/)[1]):
          (Number(tag(value,'octave'))+1)*12+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[tag(value,'step')]+Number(tag(value,'alter')||0);
        const key=`${partIndex}:${tag(value,'staff')||1}:${tag(value,'voice')}:${pitch}`;
        let event;
        if(value.includes('<tie type="stop"/>')) {
          event=tied.get(key);assert(event,'tie has no preceding note');
          assert.equal(event.start+event.duration,start,'tie changes sounding timing');event.duration+=duration;
        }else {event={part:partIndex,pitch,start,duration};events.push(event);}
        if(value.includes('<tie type="start"/>'))tied.set(key,event);else tied.delete(key);
      }
      assert.equal(cursor,(measureIndex+1)*measureTicks,'final voice does not fill the measure');
    }
  }
  assert.equal(tied.size,0,'unclosed ties');
  return events.sort((a,b)=>a.part-b.part||a.start-b.start||a.pitch-b.pitch||a.duration-b.duration);
}
const makeVersion=(notes,meter=[4,4])=>({title:'排版测试',difficulty:'full',instrument:'piano',
  ppq:480,bpm:100,keyFifths:0,keyMode:0,timeSignature:meter,notes});
const note=(pitch,start,duration,hand='right')=>({pitch,start,duration,hand,velocity:80});

test('持续声部不被另一声部的短音反复切碎，附点音符保留原始时值',()=>{
  const notes=[note(72,0,1440),note(64,0,240),note(65,240,240),note(67,480,240),
    note(69,720,240),note(67,960,240),note(65,1200,240),note(48,0,1920,'left')];
  const version=makeVersion(notes),snapshot=JSON.stringify(version),midi=versionToMidi(version);
  const xml=versionToMusicXML(version);
  assert.match(xml,/<type>half<\/type><dot\/>/);
  assert(!xml.includes('<tie '),'independent sustain should not need ties');
  assert.match(xml,/<voice>2<\/voice>/);
  assert.match(xml,/<beam number="1">begin<\/beam>/);
  assert.deepEqual(soundingEvents(xml),notes.map(({pitch,start,duration})=>({part:0,pitch,start,duration}))
    .sort((a,b)=>a.start-b.start||a.pitch-b.pitch));
  assert.equal(JSON.stringify(version),snapshot);assert.deepEqual(versionToMidi(version),midi);
});

test('切分音与跨小节长音保持起止时间，并写出必要延音线',()=>{
  const notes=[note(67,240,480),note(72,1680,960),note(48,0,3840,'left')];
  const xml=versionToMusicXML(makeVersion(notes));
  assert.match(xml,/<tie type="start"\/>/);
  assert.deepEqual(soundingEvents(xml),notes.map(({pitch,start,duration})=>({part:0,pitch,start,duration}))
    .sort((a,b)=>a.start-b.start||a.pitch-b.pitch));
});

test('6/8 按附点四分音符分组符杠，空谱表使用整小节休止',()=>{
  const notes=Array.from({length:6},(_,i)=>note(60+i,i*240,240));
  const xml=versionToMusicXML(makeVersion(notes,[6,8]));
  assert.equal((xml.match(/<beam number="1">begin<\/beam>/g)||[]).length,2);
  assert.match(xml,/<rest measure="yes"\/>/);
  assert.equal(soundingEvents(xml,[6,8]).length,6);
});

test('所有示例、三档难度导出的 MusicXML 与 MIDI 音符时间一致',()=>{
  for(const file of fs.readdirSync(path.join(__dirname,'..','samples')).filter(file=>file.endsWith('.mid'))) {
    const source=analyzeMidi(fs.readFileSync(path.join(__dirname,'..','samples',file)),file);
    for(const difficulty of ['beginner','intermediate','full']) {
      const version=generateVersion(source,source.tracks.map(track=>track.id),'auto',difficulty,source.title,{});
      const expected=version.parts.flatMap((part,index)=>part.notes.map(({pitch,start,duration})=>({part:index,pitch,start,duration})))
        .sort((a,b)=>a.part-b.part||a.start-b.start||a.pitch-b.pitch||a.duration-b.duration);
      assert.deepEqual(soundingEvents(versionToMusicXML(version),version.timeSignature),expected,`${file} ${difficulty}`);
    }
  }
});
