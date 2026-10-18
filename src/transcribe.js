// Conservative local melody transcription. Audio is not separated into instruments.
const TRANSCRIBE_SAMPLE_RATE=22050;
const TRANSCRIBE_FFT_SIZE=8192;
const TRANSCRIBE_HOP=1024;
const TRANSCRIBE_MIN_PITCH=40;
const TRANSCRIBE_MAX_PITCH=88;
const MELODY_MIN_PITCH=52;
const MELODY_MAX_PITCH=84;

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
  // Broadband hits are often louder than notes, but lack a stable harmonic spectrum.
  let sum=0,logSum=0,count=0,peakBin=0;
  for(let bin=Math.ceil(55/binHz);bin<Math.min(magnitudes.length,Math.floor(5000/binHz));bin++){
    const value=magnitudes[bin]+1e-8;
    sum+=value;logSum+=Math.log(value);count++;peakBin=Math.max(peakBin,value);
  }
  const mean=sum/count;
  const peakContrast=peakBin/mean;
  if(!mean||peakContrast<8||(Math.exp(logSum/count)/mean>.48&&peakContrast<15))return [];
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
    if(score[pitch]<maximum*.43||fundamental[pitch]<maximumFundamental*.22)continue;
    if(score[pitch]<score[pitch-1]||score[pitch]<score[pitch+1])continue;
    candidates.push({pitch,strength:score[pitch],fundamental:fundamental[pitch]});
  }
  candidates.sort((a,b)=>b.strength-a.strength);
  const chosen=[];
  for(const candidate of candidates){
    // A strong lower note commonly creates octave/fifth spectral peaks. Keep an
    // upper note when its own fundamental is substantial, as in a real chord.
    const harmonicOfLower=chosen.some(lower=>{
      const interval=candidate.pitch-lower.pitch;
      return [12,19,24].includes(interval) &&
        score[lower.pitch]>candidate.strength*1.5 &&
        fundamental[lower.pitch]>fundamental[candidate.pitch]*1.55;
    });
    if(!harmonicOfLower)chosen.push(candidate);
    if(chosen.length===4)break;
  }
  return chosen;
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
  const input=new Float32Array(TRANSCRIBE_FFT_SIZE), frames=[];
  let soundingFrames=0,ambiguousFrames=0;
  for(let frame=0;frame<frameCount;frame++){
    const center=frame*TRANSCRIBE_HOP,offset=center-TRANSCRIBE_FFT_SIZE/2;
    let centralEnergy=0;
    for(let i=center-TRANSCRIBE_HOP/2;i<center+TRANSCRIBE_HOP/2;i++){
      if(i>=0&&i<samples.length)centralEnergy+=samples[i]*samples[i];
    }
    let pitched=[];
    if(centralEnergy/TRANSCRIBE_HOP>.00006){
      soundingFrames++;
      for(let i=0;i<input.length;i++){
        const position=offset+i,value=position>=0&&position<samples.length?samples[position]:0;
        input[i]=value*window[i];
      }
      pitched=dominantPitches(fftMagnitude(input),sampleRate,TRANSCRIBE_FFT_SIZE);
    }
    const melody=pitched.filter(n=>n.pitch>=MELODY_MIN_PITCH&&n.pitch<=MELODY_MAX_PITCH);
    const [first,second]=melody;
    const octave=melody.length===2&&second.pitch===first.pitch+12&&
      second.fundamental>=first.fundamental*.8&&second.strength>=first.strength*.65 ? second : null;
    // Comparable peaks have no defensible melody choice. Silence is better than
    // inventing simultaneous or rapidly alternating notes from a full mix.
    if(first&&second&&!octave&&first.strength<second.strength*1.32)ambiguousFrames++;
    frames.push(octave?.pitch ?? (first&&(!second||first.strength>=second.strength*1.32)?first.pitch:null));
    if(frame%16===0){
      onProgress(Math.min(1,frame/frameCount));
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  onProgress(1);
  // Five-frame majority removes isolated pitch guesses while retaining note
  // transitions. A short gap in the same note is bridged after segmentation.
  const stable=frames.map((pitch,index)=>{
    if(pitch===null)return null;
    let support=0;
    for(let j=Math.max(0,index-2);j<=Math.min(frames.length-1,index+2);j++)
      if(frames[j]===pitch)support++;
    return support>=3?pitch:null;
  });
  for(let i=1;i<stable.length-1;i++)
    if(stable[i]===null&&stable[i-1]!==null&&stable[i-1]===stable[i+1])stable[i]=stable[i-1];
  const frameSeconds=TRANSCRIBE_HOP/sampleRate,audioSeconds=samples.length/sampleRate;
  const notes=[];
  let start=0,pitch=null;
  for(let i=0;i<=stable.length;i++){
    const current=stable[i]??null;
    if(current===pitch)continue;
    if(pitch!==null){
      const begin=Math.max(0,start*frameSeconds-.025);
      const end=Math.min(audioSeconds,i*frameSeconds);
      if(end-begin>=.23)notes.push({pitch,start:begin,duration:end-begin,velocity:84});
    }
    start=i;pitch=current;
  }
  for(let i=1;i<notes.length;i++){
    const previous=notes[i-1],next=notes[i],gap=next.start-previous.start-previous.duration;
    if(previous.pitch===next.pitch&&gap>=0&&gap<=.12){
      previous.duration=next.start+next.duration-previous.start;
      notes.splice(i--,1);
    }
  }
  // A brief bass or chord peak should not pull an otherwise high melody into a
  // different register. Use this recording's own note distribution, not a fixed
  // pitch cutoff, so genuinely low melodies remain possible.
  if(notes.length>=3){
    const orderedPitches=notes.map(note=>note.pitch).sort((a,b)=>a-b);
    const middle=orderedPitches[Math.floor(orderedPitches.length/2)];
    for(let i=notes.length-1;i>=0;i--)
      if(Math.abs(notes[i].pitch-middle)>14)notes.splice(i,1);
  }
  const covered=notes.reduce((total,n)=>total+n.duration,0);
  if(!notes.length||
    (soundingFrames>10&&covered/(soundingFrames*frameSeconds)<.25)||
    (soundingFrames>20&&ambiguousFrames/soundingFrames>.55)||
    notes.length>Math.max(8,audioSeconds*4.5))
    throw new Error('这段 MP3 的旋律不够清晰，无法可靠转写。请尝试人声或独奏更突出的片段；软件不会生成大量猜测音符。');
  return notes;
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
