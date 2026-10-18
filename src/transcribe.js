// Lightweight local pitch transcription. It extracts a few prominent pitched
// notes from each analysis frame; it does not infer instruments or drum parts.
const TRANSCRIBE_SAMPLE_RATE=22050;
const TRANSCRIBE_FFT_SIZE=8192;
const TRANSCRIBE_HOP=1024;
const TRANSCRIBE_MIN_PITCH=40;
const TRANSCRIBE_MAX_PITCH=88;

function fftMagnitude(input) {
  const size=input.length, real=Float64Array.from(input), imag=new Float64Array(size);
  for(let i=1,j=0;i<size;i++){
    let bit=size>>1;
    for(;j&bit;bit>>=1)j^=bit;
    j^=bit;
    if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}
  }
  for(let length=2;length<=size;length*=2){
    const angle=-2*Math.PI/length, stepRe=Math.cos(angle), stepIm=Math.sin(angle);
    for(let start=0;start<size;start+=length){
      let wr=1,wi=0;
      for(let j=0;j<length/2;j++){
        const a=start+j,b=a+length/2;
        const vr=real[b]*wr-imag[b]*wi, vi=real[b]*wi+imag[b]*wr;
        real[b]=real[a]-vr;imag[b]=imag[a]-vi;
        real[a]+=vr;imag[a]+=vi;
        const nextRe=wr*stepRe-wi*stepIm;wi=wr*stepIm+wi*stepRe;wr=nextRe;
      }
    }
  }
  const magnitudes=new Float32Array(size/2);
  for(let i=0;i<magnitudes.length;i++)magnitudes[i]=Math.hypot(real[i],imag[i]);
  return magnitudes;
}
function dominantPitches(magnitudes,sampleRate,fftSize) {
  const binHz=sampleRate/fftSize, score=[],fundamental=[];
  const peakAt=frequency=>{
    const center=Math.round(frequency/binHz);
    let peak=0;
    for(let offset=-1;offset<=1;offset++){
      const bin=center+offset;
      if(bin>0&&bin<magnitudes.length)peak=Math.max(peak,magnitudes[bin]);
    }
    return peak;
  };
  for(let pitch=TRANSCRIBE_MIN_PITCH;pitch<=TRANSCRIBE_MAX_PITCH;pitch++){
    const frequency=440*2**((pitch-69)/12);
    const first=peakAt(frequency);
    fundamental[pitch]=first;
    score[pitch]=first+.35*peakAt(frequency*2)+.16*peakAt(frequency*3);
  }
  const maximum=Math.max(...score.filter(Number.isFinite));
  const maximumFundamental=Math.max(...fundamental.filter(Number.isFinite));
  if(!maximum||!maximumFundamental)return [];
  const candidates=[];
  for(let pitch=TRANSCRIBE_MIN_PITCH;pitch<=TRANSCRIBE_MAX_PITCH;pitch++){
    if(score[pitch]<maximum*.39||fundamental[pitch]<maximumFundamental*.19)continue;
    if(score[pitch]<score[pitch-1]||score[pitch]<score[pitch+1])continue;
    candidates.push({pitch,strength:score[pitch]});
  }
  return candidates.sort((a,b)=>b.strength-a.strength).slice(0,4);
}
function resampleAudio(audioBuffer) {
  const rate=audioBuffer.sampleRate, channels=audioBuffer.numberOfChannels;
  if(!rate||!channels||!audioBuffer.length)throw new Error('音频没有可转写的声音。');
  const data=Array.from({length:channels},(_,i)=>audioBuffer.getChannelData(i));
  const length=Math.floor(audioBuffer.length*TRANSCRIBE_SAMPLE_RATE/rate);
  const samples=new Float32Array(length);
  let peak=0;
  for(let i=0;i<length;i++){
    const position=i*rate/TRANSCRIBE_SAMPLE_RATE,lo=Math.floor(position),hi=Math.min(audioBuffer.length-1,lo+1);
    let value=0;
    for(const channel of data)value+=channel[lo]*(1-(position-lo))+channel[hi]*(position-lo);
    samples[i]=value/channels;
    peak=Math.max(peak,Math.abs(samples[i]));
  }
  if(peak<.0005)throw new Error('音频几乎没有可听声音，无法转写。');
  const gain=Math.min(8,.8/peak);
  for(let i=0;i<samples.length;i++)samples[i]*=gain;
  return samples;
}
async function transcribeSamples(samples,sampleRate=TRANSCRIBE_SAMPLE_RATE,onProgress=()=>{}) {
  if(!(samples instanceof Float32Array)||!samples.length)throw new Error('音频数据为空。');
  if(sampleRate!==TRANSCRIBE_SAMPLE_RATE)throw new Error('转写采样率不匹配。');
  const window=new Float32Array(TRANSCRIBE_FFT_SIZE);
  for(let i=0;i<window.length;i++)window[i]=.5-.5*Math.cos(2*Math.PI*i/(window.length-1));
  const frameCount=Math.ceil((samples.length+TRANSCRIBE_FFT_SIZE/2)/TRANSCRIBE_HOP);
  const input=new Float32Array(TRANSCRIBE_FFT_SIZE), active=new Map(), notes=[];
  function finish(pitch,lastActive) {
    const note=active.get(pitch);
    if(!note)return;
    const end=Math.min(samples.length/sampleRate,(lastActive+1)*TRANSCRIBE_HOP/sampleRate);
    const duration=end-note.start;
    if(duration>=.1)notes.push({pitch,start:note.start,duration,velocity:Math.round(72+Math.min(30,note.strength*20))});
    active.delete(pitch);
  }
  for(let frame=0;frame<frameCount;frame++){
    const center=frame*TRANSCRIBE_HOP,offset=center-TRANSCRIBE_FFT_SIZE/2;
    let centralEnergy=0;
    for(let i=center-TRANSCRIBE_HOP/2;i<center+TRANSCRIBE_HOP/2;i++){
      if(i>=0&&i<samples.length)centralEnergy+=samples[i]*samples[i];
    }
    let pitched=[];
    if(centralEnergy/TRANSCRIBE_HOP>.00006){
      for(let i=0;i<input.length;i++){
        const position=offset+i,value=position>=0&&position<samples.length?samples[position]:0;
        input[i]=value*window[i];
      }
      pitched=dominantPitches(fftMagnitude(input),sampleRate,TRANSCRIBE_FFT_SIZE);
    }
    const present=new Set(pitched.map(n=>n.pitch));
    for(const [pitch,note] of active){
      if(present.has(pitch)){note.lastActive=frame;note.missing=0;}
      else if(++note.missing>=2)finish(pitch,note.lastActive);
    }
    for(const candidate of pitched){
      if(!active.has(candidate.pitch))active.set(candidate.pitch,{
        start:Math.max(0,frame*TRANSCRIBE_HOP/sampleRate-.025),
        lastActive:frame,missing:0,strength:candidate.strength/TRANSCRIBE_FFT_SIZE
      });
    }
    if(frame%16===0){
      onProgress(Math.min(1,frame/frameCount));
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  for(const [pitch,note] of active)finish(pitch,note.lastActive);
  onProgress(1);
  const ordered=notes.sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  if(!ordered.length)throw new Error('没有检测到可靠的音符。请尝试旋律更清晰的 MP3。');
  return ordered;
}
async function transcribeMp3(bytes,onProgress=()=>{}) {
  const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!Context)throw new Error('此环境无法解码 MP3 音频。');
  const context=new Context();
  try {
    const raw=bytes instanceof Uint8Array?bytes:Uint8Array.from(bytes);
    let audio;
    try {audio=await context.decodeAudioData(raw.slice().buffer);}
    catch {throw new Error('MP3 无法解码，请确认文件未损坏且确实是 MP3 格式。');}
    if(audio.duration>600)throw new Error('当前版本最多转写 10 分钟音频。请先裁剪 MP3。');
    const samples=resampleAudio(audio);
    return {notes:await transcribeSamples(samples,TRANSCRIBE_SAMPLE_RATE,onProgress),duration:audio.duration};
  } finally {await context.close();}
}
const ScoreTranscriber={transcribeMp3,transcribeSamples,resampleAudio,dominantPitches};
if(typeof module!=='undefined')module.exports=ScoreTranscriber;
if(typeof window!=='undefined')window.ScoreTranscriber=ScoreTranscriber;
