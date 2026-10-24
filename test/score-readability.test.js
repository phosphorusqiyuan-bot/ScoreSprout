const test=require('node:test'),assert=require('node:assert/strict');
const {readableScore}=require('../src/score-readability'),{versionToMusicXML}=require('../src/musicxml'),{versionToMidi}=require('../src/midi');
const n=(pitch,start,duration,hand='right')=>({pitch,start,duration,hand,velocity:90});
const version=(notes,meter=[4,4],pickupTicks=0)=>({title:'易读记谱',instrument:'piano',difficulty:'full',ppq:480,bpm:100,
  timeSignature:meter,keyFifths:0,keyMode:0,notes,rhythmProcessing:{pickupTicks},parts:[{instrument:'piano',notes}]});
function filledMeasures(xml,meter,pickup=0){
  const bar=480*4*meter[0]/meter[1];
  for(const part of xml.matchAll(/<part\s[^>]*>[\s\S]*?<\/part>/g))for(const m of part[0].matchAll(/<measure\b[^>]*>[\s\S]*?<\/measure>/g)){
    let cursor=0,graces=0;const expected=/implicit="yes"/.test(m[0])?pickup:bar;
    for(const t of m[0].matchAll(/<(note|backup|forward)\b[^>]*>[\s\S]*?<\/\1>/g)){
      const duration=Number(t[0].match(/<duration>(\d+)<\/duration>/)?.[1]||0);
      if(/<grace\b/.test(t[0])){assert.equal(duration,0);graces++;continue;}
      if(t[1]==='backup')cursor-=duration;else if(!/<chord\s*\/>/.test(t[0]))cursor+=duration;
      assert(cursor>=0&&cursor<=expected,'voice must stay within its bar');
    }
    assert.equal(cursor,expected);
  }
}

test('细碎音尾和微小空隙整理为十六分网格，保留原试听与 MIDI',()=>{
  const v=version([n(60,0,450),n(62,480,210),n(64,720,450),n(48,0,1890,'left')]);
  const snapshot=JSON.stringify(v),midi=versionToMidi(v),original=versionToMusicXML(v),r=readableScore(v,original);
  assert.match(original,/<type>64th<\/type>/);assert(!/<type>(32nd|64th)<\/type>/.test(r.musicxml));
  assert.equal(r.version.notes.length,v.notes.length);assert.equal(JSON.stringify(v),snapshot);assert.deepEqual(versionToMidi(v),midi);
  filledMeasures(r.musicxml,[4,4]);
});

test('孤立短级进写成不占小节时值的倚音，连续快音和重复起音不冒充装饰',()=>{
  const v=version([n(67,0,420),n(71,420,60),n(72,480,480),n(74,960,60),n(74,1020,60),n(76,1080,60),n(77,1140,240)]);
  const r=readableScore(v,versionToMusicXML(v));
  assert.equal(r.stats.graceNotes,1);assert.match(r.musicxml,/<grace slash="yes"\/>/);
  assert.equal(r.version.notes.length,6);assert.equal(r.version.notes.find(n=>n.pitch===72).performanceStart,420);
  assert.equal(r.version.notes.filter(n=>n.pitch===74).length,2);
  assert(r.stats.preservedFastAttacks>0);filledMeasures(r.musicxml,[4,4]);
});

test('复合拍、弱起、跨小节长音与左右手和弦的小节时值仍完整',()=>{
  const v=version([n(72,240,450),n(74,720,1050),n(76,1920,480),n(48,240,2400,'left'),n(55,240,2400,'left')],[6,8],720);
  const r=readableScore(v,versionToMusicXML(v));filledMeasures(r.musicxml,[6,8],720);
  assert.match(r.musicxml,/<measure number="0" implicit="yes">/);assert.match(r.musicxml,/<tie type="start"\/>/);
});

test('旧自动伴奏的和弦边界碎片可省略，实际演奏的左手起音保留',()=>{
  const v=version([n(72,0,1920),n(50,0,30,'left'),n(55,30,450,'left'),n(50,480,480,'left')]);
  const original=versionToMusicXML(v),literal=readableScore(v,original);
  assert.equal(literal.stats.omittedAccompanimentFragments,0);
  v.mp3PianoAccompaniment=true;const r=readableScore(v,original);
  assert.equal(r.stats.omittedAccompanimentFragments,1);assert(!/<type>(32nd|64th)<\/type>/.test(r.musicxml));
  assert.equal(v.notes.length,4);filledMeasures(r.musicxml,[4,4]);
});

test('指法按起音音高与谱表转移，不随重新拆分的延音线重复',()=>{
  const v=version([n(72,0,1890),n(48,0,1920,'left')]);
  // Use an explicit first-attack annotation independent of a particular type.
  const xml=versionToMusicXML(v).replace(/(<pitch><step>C<\/step><octave>5<\/octave><\/pitch>[\s\S]*?)(<\/note>)/,'$1<notations><technical><fingering>3</fingering></technical></notations>$2');
  const r=readableScore(v,xml);assert.equal((r.musicxml.match(/<fingering\b/g)||[]).length,1);filledMeasures(r.musicxml,[4,4]);
});
