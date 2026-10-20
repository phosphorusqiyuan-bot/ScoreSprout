const test=require('node:test');
const assert=require('node:assert/strict');
const {parseMidi,writeMidi}=require('midi-file');
const {analyzeMidi,generateVersion,versionToMidi}=require('../src/midi');
const {versionToMusicXML}=require('../src/musicxml');

function makeMidi(pitches,{key=null,channel=0}={}) {
  const events=[];
  if(key) events.push({tick:0,type:'keySignature',key:key[0],scale:key[1]});
  if(channel!==9) events.push({tick:0,type:'programChange',channel,programNumber:0});
  pitches.forEach((pitch,index)=>{
    events.push({tick:index*480,type:'noteOn',channel,noteNumber:pitch,velocity:80});
    events.push({tick:index*480+420,type:'noteOff',channel,noteNumber:pitch,velocity:0});
  });
  events.sort((a,b)=>a.tick-b.tick);
  let tick=0;
  const track=events.map(({tick:at,...event})=>{const result={deltaTime:at-tick,...event};tick=at;return result;});
  track.push({deltaTime:0,type:'endOfTrack'});
  return Buffer.from(writeMidi({header:{format:0,numTracks:1,ticksPerBeat:480},tracks:[track]}));
}

const gMajor=[67,69,71,72,74,76,78,79,74,71,67,66,67,71,74,79];
const aMinor=[69,72,76,69,71,72,76,69,64,69,72,76,67,69,72,69];

test('无调号 MIDI 推断 G 大调，并写入三档乐谱和导出 MIDI',()=>{
  const source=analyzeMidi(makeMidi(gMajor),'G-major.mid');
  assert.equal(source.keyProvided,false);
  assert.equal(source.keyInferred,true);
  assert.equal(source.keyFifths,1);
  assert.equal(source.keyMode,0);
  for(const difficulty of ['full','intermediate','beginner']) {
    const version=generateVersion(source,source.tracks[0].id,'piano',difficulty,source.title);
    assert.equal(version.keyFifths,1);
    assert.match(versionToMusicXML(version),/<key><fifths>1<\/fifths><mode>major<\/mode><\/key>/);
    const events=parseMidi(versionToMidi(version)).tracks.flat();
    assert(events.some(e=>e.type==='keySignature' && e.key===1 && e.scale===0));
  }
});

test('无调号 MIDI 可推断 A 小调',()=>{
  const source=analyzeMidi(makeMidi(aMinor),'A-minor.mid');
  assert.equal(source.keyInferred,true);
  assert.equal(source.keyFifths,0);
  assert.equal(source.keyMode,1);
  const version=generateVersion(source,source.tracks[0].id,'piano','full',source.title);
  assert.match(versionToMusicXML(version),/<mode>minor<\/mode>/);
});

test('文件写明的调号优先，分析结果只作参考',()=>{
  const source=analyzeMidi(makeMidi(gMajor,{key:[0,0]}),'explicit-C.mid');
  assert.equal(source.keyProvided,true);
  assert.equal(source.keyInferred,false);
  assert.equal(source.keyFifths,0);
  assert.equal(source.keyAnalysis.fifths,1);
});

test('鼓与音符不足的旋律不猜测调性',()=>{
  const drums=analyzeMidi(makeMidi([36,38,42,36,38,42,36,38],{channel:9}),'drums.mid');
  assert.equal(drums.keyInferred,false);
  assert.equal(drums.keyAnalysis,null);
  const short=analyzeMidi(makeMidi([60,64,67]),'short.mid');
  assert.equal(short.keyInferred,false);
  assert(short.warnings.some(w=>w.includes('无法可靠识别调号')));
});
