const test=require('node:test');
const assert=require('node:assert/strict');
const {versionToMusicXML}=require('../src/musicxml');
const {layoutMusicXML}=require('../src/score-layout');

function score(timeSignature,notes,extra={}) {
  return versionToMusicXML({title:'排版',instrument:'piano',difficulty:'full',ppq:480,bpm:100,
    timeSignature,keyFifths:0,keyMode:0,notes:notes.map(n=>({hand:'right',...n})),...extra});
}
const beams=xml=>[...xml.matchAll(/<beam number="1">([^<]+)<\/beam>/g)].map(m=>m[1]);
test('按拍子连梁：四拍子每拍一组，六八拍每三音一组，休止符会断开',()=>{
  const notes=Array.from({length:8},(_,i)=>({start:i*240,duration:240,pitch:72+i%3}));
  assert.deepEqual(beams(layoutMusicXML(score([4,4],notes))),['begin','end','begin','end','begin','end','begin','end']);
  assert.deepEqual(beams(layoutMusicXML(score([6,8],notes.slice(0,6)))),['begin','continue','end','begin','continue','end']);
  assert.deepEqual(beams(layoutMusicXML(score([4,4],notes.filter((_,i)=>i!==1)))),['begin','end','begin','end','begin','end']);
});
test('弱起按小节尾部节拍连梁；混合短音包含正确的二级符杠',()=>{
  const pickup=score([4,4],[{start:0,duration:240,pitch:72},{start:240,duration:120,pitch:74},
    {start:360,duration:240,pitch:76},{start:600,duration:240,pitch:77}],{rhythmProcessing:{pickupTicks:360}});
  const xml=layoutMusicXML(pickup);
  assert.match(xml,/<beam number="2">backward hook<\/beam>/);
  assert.deepEqual(beams(xml),['begin','end','begin','end']);
});
test('为旧谱整理指法与符杠时，保留音高、时值、和弦、声部和连音，重复处理结果一致',()=>{
  const original=score([4,4],[{start:0,duration:2880,pitch:72},
    {start:240,duration:240,pitch:76},{start:480,duration:240,pitch:77},
    {start:0,duration:1920,pitch:48,hand:'left'},{start:0,duration:1920,pitch:55,hand:'left'}])
    .replace(/<\/notations>/g,'<technical><fingering>3</fingering></technical></notations>');
  const formatted=layoutMusicXML(original);
  const musical=xml=>[...xml.matchAll(/<note\b[^>]*>([\s\S]*?)<\/note>/g)].map(m=>
    m[1].replace(/<beam\b[^>]*>[\s\S]*?<\/beam>/g,'').replace(/ placement="[^"]*"/g,''));
  assert.deepEqual(musical(formatted),musical(original));
  assert.match(formatted,/<fingering placement="above">3<\/fingering>/);
  assert.equal(layoutMusicXML(formatted),formatted);
});
