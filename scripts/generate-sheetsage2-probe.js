// A reproducible melody plus quiet chords for local model integration checks.
// Writes decoded 22.05 kHz float PCM, the same format sent by the renderer.
const fs=require('node:fs');
const path=require('node:path');
const rate=22050,duration=17;
const samples=new Float32Array(rate*duration);
const motif=[69,71,72,76,74,72,71,69,67,69,71,72,69,67,64,69];
const addTone=(pitch,start,length,gain)=>{
  const frequency=440*2**((pitch-69)/12);
  const from=Math.round(start*rate),to=Math.min(samples.length,Math.round((start+length)*rate));
  for(let i=from;i<to;i++){
    const t=(i-from)/rate;
    const attack=Math.min(1,t/.025),release=Math.min(1,(to-i)/(.08*rate));
    const wave=Math.sin(2*Math.PI*frequency*t)+.22*Math.sin(4*Math.PI*frequency*t)+.08*Math.sin(6*Math.PI*frequency*t);
    samples[i]+=gain*wave*attack*release;
  }
};
motif.forEach((pitch,index)=>addTone(pitch,.5+index, .8,index%4===0?.33:.29));
for(let bar=0;bar<4;bar++)for(const pitch of [[48,52,55],[53,57,60],[55,59,62],[48,52,55]][bar])
  addTone(pitch,.4+bar*4,3.7,.018);
const out=path.join(__dirname,'..','.sheetsage2-runtime','probe.f32');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,Buffer.from(samples.buffer));
console.log(out);
