const test=require('node:test'),assert=require('node:assert/strict');
const {parseMidi}=require('midi-file');
const {generateVersion,versionToMidi}=require('../src/midi');
const {versionToMusicXML}=require('../src/musicxml');

test('MP3 的逐拍预测只用于识别一个 BPM；谱面、试听和导出保持固定速度',()=>{
  const source={inputType:'mp3',sourcePpq:480,audioBaseBpm:120,bpm:75,
    timeSignature:[4,4],keyFifths:0,keyMode:0,title:'固定节拍',
    tracks:[{id:'vocal',name:'人声',detected:'piano',role:'vocal_melody',
      notes:[{pitch:72,start:0,duration:480,velocity:80},{pitch:74,start:960,duration:480,velocity:80}]}],
    audioAnalysis:{beats:'0\t1\t4\t4\n.4\t2\t4\t4\n1.2\t3\t4\t4\n2\t4\t4\t4',chords:''}};
  const version=generateVersion(source,['vocal'],'piano','full',source.title,false,
    {settings:{mode:'melody',beatSource:'sheetsage2',rate:2,firstDownbeat:1.6,meter:[3,4],cleanup:'octave'}});
  assert.equal(version.bpm,75);
  assert.equal(version.beatMap,undefined);
  assert.equal(version.melodyProcessing,undefined);
  assert.deepEqual(version.arrangementSettings,{mode:'melody'});
  const midi=parseMidi(versionToMidi(version));
  assert.equal(midi.tracks.flat().filter(event=>event.type==='setTempo').length,1);
  assert.equal(midi.tracks.flat().find(event=>event.type==='setTempo').microsecondsPerBeat,800000);
  const xml=versionToMusicXML(version);
  assert.equal((xml.match(/<sound tempo=/g)||[]).length,1);
  assert.equal(xml.includes('print-object="no"'),false);
});

test('含变速事件的 MIDI 生成版本只输出初始 BPM',()=>{
  const source={inputType:'midi',sourcePpq:480,bpm:90,hasTempoChanges:true,
    timeSignature:[4,4],keyFifths:0,keyMode:0,title:'变速来源',
    tracks:[{id:'piano',name:'钢琴',detected:'piano',notes:[
      {pitch:60,start:0,duration:480,velocity:80},
      {pitch:62,start:960,duration:480,velocity:80}]}]};
  const version=generateVersion(source,['piano'],'piano','full',source.title);
  assert.equal(version.bpm,90);
  assert.equal(version.rhythmProcessing,undefined);
  const tempos=parseMidi(versionToMidi(version)).tracks.flat().filter(event=>event.type==='setTempo');
  assert.equal(tempos.length,1);
  assert.equal(tempos[0].microsecondsPerBeat,Math.round(60000000/90));
  assert.equal((versionToMusicXML(version).match(/<sound tempo=/g)||[]).length,1);
});
