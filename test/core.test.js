const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {parseMidi}=require('midi-file');
const {analyzeMidi,generateVersion,versionToMidi}=require('../src/midi');const {versionToMusicXML}=require('../src/musicxml');
const sample=name=>fs.readFileSync(path.join(__dirname,'..','samples',name));
for(const [file,instrument] of [['piano.mid','piano'],['guitar.mid','guitar'],['drums.mid','drums'],['bass.mid','bass']]){
  test(`${instrument}: 导入、识别、三档生成、试听数据与导出`,()=>{
    const source=analyzeMidi(sample(file),file);assert.equal(source.tracks[0].detected,instrument);assert(source.tracks[0].notes.length>0);
    const counts=[];
    for(const difficulty of ['full','intermediate','beginner']){
      const v=generateVersion(source,source.tracks[0].id,instrument,difficulty,source.title);counts.push(v.notes.length);
      assert(v.notes.every(n=>n.start>=0&&n.duration>0));
      const exported=versionToMidi(v),round=analyzeMidi(exported,'round.mid');
      assert.equal(round.tracks[0].notes.length,v.notes.length);
      assert.equal(round.bpm,v.bpm);
      const xml=versionToMusicXML(v);assert.match(xml,/<score-partwise version="4.0">/);assert.match(xml,/<measure number="1">/);
      assert((xml.match(/<duration>/g)||[]).length>0);
      if(instrument==='piano')assert.match(xml,/<staves>2<\/staves>/);
      if(instrument==='drums')assert.match(xml,/<sign>percussion<\/sign>/);
      if(instrument==='bass')assert.match(xml,/<sign>F<\/sign>/);
    }
    assert(counts[0]>=counts[1]);assert(counts[1]>=counts[2]);
  });
}
test('混合单轨按通道和音色拆分',()=>{const s=analyzeMidi(sample('mixed-track.mid'),'mixed-track.mid');assert(s.tracks.some(t=>t.detected==='piano'));assert(s.tracks.some(t=>t.detected==='bass'));assert(s.warnings.some(w=>w.includes('拆分')));});
test('无速度信息给出 120 BPM 与提示',()=>{const s=analyzeMidi(sample('no-tempo.mid'),'no-tempo.mid');assert.equal(s.bpm,120);assert(s.warnings.some(w=>w.includes('没有速度')));});
test('不允许拿错误乐器轨道冒充鼓谱',()=>{const s=analyzeMidi(sample('piano.mid'),'piano.mid');assert.throws(()=>generateVersion(s,s.tracks[0].id,'drums','beginner',s.title,true),/不能作为鼓/);});
test('损坏文件有可理解的错误',()=>assert.throws(()=>analyzeMidi(Buffer.from('not midi'),'broken.mid'),/无法读取/));
