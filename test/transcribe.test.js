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
test('真实的八度和弦不会被泛音过滤误删',async()=>{
  const rate=22050,samples=new Float32Array(rate*2);
  for(let i=0;i<samples.length;i++){
    const time=i/rate;
    if(time<.2||time>1.8)continue;
    samples[i]=.26*Math.sin(2*Math.PI*220*time)+.26*Math.sin(2*Math.PI*440*time);
  }
  const notes=await transcribeSamples(samples,rate);
  assert.deepEqual([...new Set(notes.map(n=>n.pitch))].sort((a,b)=>a-b),[57,69],JSON.stringify(notes));
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
test('清晰的三和弦仍可转写为三个音高',async()=>{
  const rate=22050,samples=new Float32Array(rate*2);
  for(let i=0;i<samples.length;i++){
    const time=i/rate;
    if(time<.2||time>1.8)continue;
    for(const pitch of [60,64,67])samples[i]+=.2*Math.sin(2*Math.PI*440*2**((pitch-69)/12)*time);
  }
  const notes=await transcribeSamples(samples,rate);
  assert.deepEqual([...new Set(notes.map(n=>n.pitch))].sort((a,b)=>a-b),[60,64,67],JSON.stringify(notes));
});
test('只有宽带噪声时不生成伪 MIDI 音符',async()=>{
  const rate=22050,samples=new Float32Array(rate*2);
  let seed=593;
  for(let i=0;i<samples.length;i++)
    samples[i]=((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/0xffffffff)*1.2-.6;
  await assert.rejects(transcribeSamples(samples,rate),/没有检测到可靠的音符/);
});
test('转写音符保存为待指定乐器的 MIDI，可继续生成乐谱',()=>{
  const midi=transcribedNotesToMidi([{pitch:69,start:.3,duration:.95,velocity:90},
    {pitch:71,start:1.65,duration:.9,velocity:88}]);
  const source=analyzeMidi(midi,'sample.mid');
  assert.equal(source.bpm,120);
  assert.equal(source.tracks.length,1);
  assert.equal(source.tracks[0].detected,'unknown');
  assert(source.tracks[0].notes[0].duration>=900);
  const version=generateVersion(source,[source.tracks[0].id],'auto','full','sample',{[source.tracks[0].id]:'piano'});
  assert.equal(version.instrument,'piano');
  assert(version.notes.length>0);
  source.inputType='mp3';
  assert.throws(()=>generateVersion(source,[source.tracks[0].id],'auto','full','sample',
    {[source.tracks[0].id]:'drums'}),/不能将其音高作为鼓谱/);
  assert.throws(()=>transcribedNotesToMidi([{pitch:300,start:0,duration:1,velocity:80}]),/无效音符/);
});
