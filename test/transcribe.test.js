const test=require('node:test');
const assert=require('node:assert/strict');
const {transcribeSamples}=require('../src/transcribe');
const {transcribedNotesToMidi}=require('../src/audio-import');
const {analyzeMidi,generateVersion}=require('../src/midi');
test('从持续的单音音频提取音高、开始时间和时值',async()=>{
  const rate=22050,samples=new Float32Array(rate*3);
  for(let i=0;i<samples.length;i++){
    const time=i/rate;
    if(time>=.3&&time<1.3)samples[i]=.45*Math.sin(2*Math.PI*440*time);
    if(time>=1.65&&time<2.65)samples[i]=.45*Math.sin(2*Math.PI*493.883*time);
  }
  const progress=[];
  const notes=await transcribeSamples(samples,rate,p=>progress.push(p));
  const a=notes.find(n=>n.pitch===69&&n.start<.6);
  const b=notes.find(n=>n.pitch===71&&n.start>1.3&&n.start<1.9);
  assert(a,`A4 missing: ${JSON.stringify(notes)}`);
  assert(b,`B4 missing: ${JSON.stringify(notes)}`);
  assert(Math.abs(a.start-.3)<.1&&Math.abs(b.start-1.65)<.1);
  assert(a.duration>.8&&a.duration<1.2&&b.duration>.8&&b.duration<1.2);
  assert.equal(progress.at(-1),1);
});
test('强泛音不会被误写成高八度或五度的独立音符',async()=>{
  const rate=22050,samples=new Float32Array(rate*2);
  for(let i=0;i<samples.length;i++){
    const time=i/rate;
    if(time<.25||time>1.75)continue;
    for(let harmonic=1;harmonic<=5;harmonic++)
      samples[i]+=.28/harmonic*Math.sin(2*Math.PI*220*harmonic*time);
  }
  const notes=await transcribeSamples(samples,rate);
  assert.deepEqual([...new Set(notes.map(n=>n.pitch))],[57],JSON.stringify(notes));
  assert(notes[0].duration>1.3);
});
test('真实的八度音程只保留上方旋律音',async()=>{
  const rate=22050,samples=new Float32Array(rate*2);
  for(let i=0;i<samples.length;i++){
    const time=i/rate;
    if(time<.2||time>1.8)continue;
    samples[i]=.26*Math.sin(2*Math.PI*220*time)+.26*Math.sin(2*Math.PI*440*time);
  }
  const notes=await transcribeSamples(samples,rate);
  assert.deepEqual([...new Set(notes.map(n=>n.pitch))],[69],JSON.stringify(notes));
});
test('旋律叠加短促宽带噪声时仍保留长音，过滤杂音符',async()=>{
  const rate=22050,samples=new Float32Array(rate*3);
  let seed=317;
  for(let i=0;i<samples.length;i++){
    const time=i/rate;
    const noise=((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/0xffffffff)*2-1;
    if(time>.25&&time<2.7)samples[i]+=.26*Math.sin(2*Math.PI*440*time);
    if((time>.7&&time<.82)||(time>1.5&&time<1.64))samples[i]+=.8*noise;
  }
  const notes=await transcribeSamples(samples,rate);
  assert(notes.some(n=>n.pitch===69&&n.duration>2),JSON.stringify(notes));
  assert.deepEqual([...new Set(notes.map(n=>n.pitch))],[69],JSON.stringify(notes));
});
test('无法确定主旋律的均衡三和弦会明确拒绝转写',async()=>{
  const rate=22050,samples=new Float32Array(rate*2);
  for(let i=0;i<samples.length;i++){
    const time=i/rate;
    if(time<.2||time>1.8)continue;
    for(const pitch of [60,64,67])samples[i]+=.2*Math.sin(2*Math.PI*440*2**((pitch-69)/12)*time);
  }
  await assert.rejects(transcribeSamples(samples,rate),/旋律不够清晰/);
});
test('有低音伴奏时只提取突出的连续旋律',async()=>{
  const rate=22050,samples=new Float32Array(rate*3);
  for(let i=0;i<samples.length;i++){
    const time=i/rate;
    if(time>.2&&time<2.8)samples[i]+=.12*Math.sin(2*Math.PI*130.813*time);
    if(time>.3&&time<1.3)samples[i]+=.43*Math.sin(2*Math.PI*440*time);
    if(time>1.55&&time<2.55)samples[i]+=.43*Math.sin(2*Math.PI*493.883*time);
    if(time>2.55)samples[i]+=.5*Math.sin(2*Math.PI*164.814*time);
  }
  const notes=await transcribeSamples(samples,rate);
  assert.deepEqual([...new Set(notes.map(n=>n.pitch))].sort((a,b)=>a-b),[69,71],JSON.stringify(notes));
  assert(notes.every((note,index)=>index===0||note.start>=notes[index-1].start+notes[index-1].duration));
});
test('旋律与和弦及鼓点混合时不把伴奏铺满乐谱',async()=>{
  const rate=22050,samples=new Float32Array(rate*4);
  let seed=1187;
  for(let i=0;i<samples.length;i++){
    const time=i/rate;
    const noise=((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/0xffffffff)*2-1;
    if(time>.2&&time<3.85)
      for(const pitch of [60,64,67])samples[i]+=.12*Math.sin(2*Math.PI*440*2**((pitch-69)/12)*time);
    for(const [pitch,begin,end] of [[69,.3,1.25],[71,1.45,2.4],[74,2.65,3.6]])
      if(time>begin&&time<end)samples[i]+=.38*Math.sin(2*Math.PI*440*2**((pitch-69)/12)*time);
    if(time>.75&&time<.87||time>1.75&&time<1.87||time>2.75&&time<2.87)
      samples[i]+=.55*noise;
  }
  const notes=await transcribeSamples(samples,rate);
  assert.deepEqual([...new Set(notes.map(n=>n.pitch))].sort((a,b)=>a-b),[69,71,74],JSON.stringify(notes));
  assert(notes.length<=4,JSON.stringify(notes));
});
test('只有宽带噪声时不生成伪 MIDI 音符',async()=>{
  const rate=22050,samples=new Float32Array(rate*2);
  let seed=593;
  for(let i=0;i<samples.length;i++)
    samples[i]=((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/0xffffffff)*1.2-.6;
  await assert.rejects(transcribeSamples(samples,rate),/旋律不够清晰/);
});
test('转写音符保存为钢琴旋律 MIDI，不能伪装为其他乐器',()=>{
  const midi=transcribedNotesToMidi([{pitch:69,start:.3,duration:.95,velocity:90},
    {pitch:71,start:1.65,duration:.9,velocity:88}]);
  const source=analyzeMidi(midi,'sample.mid');
  assert.equal(source.bpm,120);
  assert.equal(source.tracks.length,1);
  assert.equal(source.tracks[0].detected,'piano');
  assert(source.tracks[0].notes[0].duration>=900);
  source.inputType='mp3';
  source.tracks[0].detected='unknown'; // older imports did not identify an instrument
  const version=generateVersion(source,[source.tracks[0].id],'auto','full','sample',{});
  assert.equal(version.instrument,'piano');
  assert(version.notes.length>0);
  assert.throws(()=>generateVersion(source,[source.tracks[0].id],'auto','full','sample',
    {[source.tracks[0].id]:'drums'}),/只能生成钢琴旋律谱/);
  assert.throws(()=>generateVersion(source,[source.tracks[0].id],'guitar','full','sample',{}),/只能生成钢琴旋律谱/);
  assert.throws(()=>transcribedNotesToMidi([{pitch:300,start:0,duration:1,velocity:80}]),/无效音符/);
});
