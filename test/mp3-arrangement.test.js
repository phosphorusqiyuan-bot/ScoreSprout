const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeMidi,generateVersion,versionToMidi}=require('../src/midi');
const {versionToMusicXML}=require('../src/musicxml');

const source={
  inputType:'mp3',sourcePpq:960,bpm:120,title:'双旋律测试',timeSignature:[4,4],keyFifths:0,keyMode:0,
  tracks:[
    {id:'vocal',name:'人声旋律',detected:'piano',notes:[
      {pitch:72,start:960,duration:800,velocity:92},{pitch:74,start:1920,duration:800,velocity:91},
      {pitch:76,start:2880,duration:800,velocity:91}]},
    {id:'instrumental',name:'器乐旋律',detected:'piano',notes:[
      {pitch:67,start:960,duration:800,velocity:76},{pitch:69,start:1920,duration:800,velocity:77},
      {pitch:71,start:2880,duration:800,velocity:77}]}
  ],
  audioAnalysis:{
    chords:'0.5\t2.5\tC:maj\n2.5\t4.5\tF:maj',
    beats:'0.5\t1\t4\t4\n1\t2\t4\t4\n1.5\t3\t4\t4\n2\t4\t4\n2.5\t1\t4\t4\n3\t2\t4\t4\n3.5\t3\t4\t4\n4\t4\t4\t4'
  }
};

test('MP3 双旋律进入钢琴左右手，三个难度均能播放、记谱及导出',()=>{
  for(const difficulty of ['beginner','intermediate','full']){
    const v=generateVersion(source,['vocal','instrumental'],'piano',difficulty,'双旋律测试');
    assert(v.notes.some(n=>n.hand==='right'));
    assert(v.notes.some(n=>n.hand==='left'));
    assert(v.notes.filter(n=>n.hand==='left').every(n=>n.pitch>=40&&n.pitch<=64));
    const xml=versionToMusicXML(v);
    assert.match(xml,/<staves>2<\/staves>/);
    assert.match(xml,/<staff>1<\/staff>/);
    assert.match(xml,/<staff>2<\/staff>/);
    const exported=analyzeMidi(versionToMidi(v),'export.mid');
    assert.equal(exported.tracks.reduce((sum,t)=>sum+t.notes.length,0),v.notes.length);
  }
});

test('MP3 吉他、贝斯、鼓编配均有三档可播放音符和正确谱号',()=>{
  for(const instrument of ['guitar','bass','drums']){
    let previousCount=Infinity;
    for(const difficulty of ['full','intermediate','beginner']){
      const ids=instrument==='guitar'?['vocal']:[];
      const v=generateVersion(source,ids,instrument,difficulty,'双旋律测试');
      assert.equal(v.instrument,instrument);
      assert(v.notes.length>0);
      assert(v.provenance.includes('不是原曲'));
      assert(v.notes.length<=previousCount);
      previousCount=v.notes.length;
      const xml=versionToMusicXML(v);
      assert.match(xml,instrument==='drums'?/<sign>percussion<\/sign>/:instrument==='bass'?/<sign>F<\/sign>/:/<sign>G<\/sign>/);
      const exported=analyzeMidi(versionToMidi(v),'export.mid');
      assert.equal(exported.tracks.reduce((sum,t)=>sum+t.notes.length,0),v.notes.length);
    }
  }
});

test('缺少和弦或节拍时不给出假贝斯或鼓谱',()=>{
  assert.throws(()=>generateVersion({...source,audioAnalysis:{beats:source.audioAnalysis.beats}},[],'bass','full','测试'),/没有识别出可用和弦/);
  assert.throws(()=>generateVersion({...source,audioAnalysis:{chords:source.audioAnalysis.chords}},[],'drums','full','测试'),/没有识别出足够节拍/);
});
