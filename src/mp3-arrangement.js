// SheetSage2 predicts melodies, chord labels and beats. Guitar, bass and drum
// results below are practice arrangements derived from those predictions;
// they are not claims that the original recording contained those notes.
function parseRows(value, minColumns) {
  return String(value || '').trim().split(/\r?\n/).filter(Boolean)
    .map(line => line.split('\t')).filter(columns => columns.length >= minColumns);
}

function parseChords(value) {
  return parseRows(value,3).map(([a,b,label]) => ({start:Number(a),end:Number(b),label:String(label)}))
    .filter(chord => Number.isFinite(chord.start)&&Number.isFinite(chord.end)&&
      chord.start>=0&&chord.end>chord.start&&chord.end<=601);
}

function parseBeats(value) {
  const rows=parseRows(value,4).map(([time,position,numerator,denominator]) => ({
    time:Number(time),position:Number(position),numerator:Number(numerator),denominator:Number(denominator)
  })).filter(beat => Number.isFinite(beat.time)&&beat.time>=0&&beat.time<=600&&
    Number.isInteger(beat.position)&&Number.isInteger(beat.numerator)&&
    beat.numerator>=2&&beat.numerator<=12&&beat.position>=1&&beat.position<=beat.numerator&&
    [2,4,8].includes(beat.denominator));
  if(!rows.length)return [];
  const counts=new Map();
  for(const beat of rows){const meter=`${beat.numerator}/${beat.denominator}`;counts.set(meter,(counts.get(meter)||0)+1);}
  const meter=[...counts].sort((a,b)=>b[1]-a[1])[0][0];
  return rows.filter(beat=>`${beat.numerator}/${beat.denominator}`===meter)
    .sort((a,b)=>a.time-b.time).filter((beat,index,ordered)=>index===0||beat.time>ordered[index-1].time+.15);
}

const pitchClasses={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function chordTones(label) {
  const match=/^([A-G])([#b]?)(?::([^/]+))?/i.exec(label);
  if(!match)return null;
  const root=(pitchClasses[match[1].toUpperCase()]+(match[2]==='#'?1:match[2]==='b'?-1:0)+12)%12;
  const quality=(match[3]||'maj').toLowerCase();
  const minor=/^min|^m(?!aj)/.test(quality),dim=/dim|hdim/.test(quality),aug=/aug/.test(quality);
  const intervals=dim?[0,3,6]:aug?[0,4,8]:/sus2/.test(quality)?[0,2,7]:/sus4/.test(quality)?[0,5,7]:
    minor?[0,3,7]:[0,4,7];
  if(/7/.test(quality))intervals.push(/maj7/.test(quality)?11:dim?9:10);
  return {root,intervals};
}

function activeChord(chords,time) {
  return chords.find(chord=>chord.start-.05<=time&&time<chord.end+.05&&chordTones(chord.label));
}
function secondsToTicks(source,seconds){return Math.round(seconds*source.sourcePpq*source.bpm/60);}
function fitOctave(pitch,low,high){while(pitch<low)pitch+=12;while(pitch>high)pitch-=12;return pitch;}
function median(values){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];}
function isVocal(track){return /vocal|人声/i.test(track.name);}

function pianoLeftHand(source,chords,beats,melody,difficulty) {
  const seconds=ticks=>ticks/source.sourcePpq*60/source.bpm;
  const first=seconds(Math.min(...melody.map(note=>note.start)));
  const last=seconds(Math.max(...melody.map(note=>note.start+note.duration)));
  const notes=[];
  for(const chord of chords){
    const tones=chordTones(chord.label);
    const start=Math.max(first,chord.start),end=Math.min(last,chord.end);
    if(!tones||end-start<.25)continue;
    const chordBeats=beats.filter(beat=>beat.time>=start-.08&&beat.time<end-.08);
    const pulses=chordBeats.length ? chordBeats.map(beat=>({time:Math.max(start,beat.time),position:beat.position})) :
      [{time:start,position:1}];
    if(pulses[0].time>start+.25)pulses.unshift({time:start,position:1});
    const root=fitOctave(48+tones.root,43,54);
    const upper=tones.intervals.slice(1,3).map(interval=>root+interval);
    const chosen=pulses.filter((pulse,index)=>difficulty==='full'||index===0||
      (difficulty==='beginner'?pulse.position%2===1:pulse.position===1||pulse.position===3));
    for(let index=0;index<chosen.length;index++){
      const pulse=chosen[index],next=chosen[index+1]?.time||end;
      const length=Math.min(end,next,pulse.time+(difficulty==='beginner'?2:1.5))-pulse.time;
      if(length<.12)continue;
      const downbeat=pulse.position===1||index===0;
      const pitches=difficulty==='beginner'?[root]:difficulty==='intermediate'?
        (downbeat?[root]:upper):downbeat?[root,...upper]:index%2?[...upper]:[root];
      for(const pitch of pitches)notes.push({pitch,start:secondsToTicks(source,pulse.time),
        duration:Math.max(1,secondsToTicks(source,length)),velocity:downbeat?58:48,hand:'left'});
    }
  }
  return notes;
}

function arrangeMp3(source,selected,instrument,difficulty='full') {
  const analysis=source.audioAnalysis||{};
  const chords=parseChords(analysis.chords),beats=parseBeats(analysis.beats);
  const s=time=>secondsToTicks(source,time);
  const notes=[];
  let trackName='',provenance='',pianoAccompaniment=false;
  if(instrument==='piano'){
    if(!selected.length)throw new Error('钢琴谱请先选择人声或器乐旋律。');
    if(selected.length>2)throw new Error('钢琴谱最多选择人声与器乐两条旋律。');
    const right=selected.find(isVocal)||selected[0];
    const left=selected.find(track=>track.id!==right.id);
    notes.push(...right.notes.map(note=>({...note,hand:'right'})));
    if(left){
      const center=median(left.notes.map(note=>note.pitch));
      const shift=Math.max(-24,Math.min(24,Math.round((54-center)/12)*12));
      notes.push(...left.notes.map(note=>({...note,pitch:fitOctave(note.pitch+shift,40,64),hand:'left'})));
      trackName=`${right.name}（右手） + ${left.name}（左手）`;
      provenance='SheetSage2 两条旋律的双手改编；左手器乐旋律可能移八度，并非原曲钢琴伴奏。';
    }else{
      const accompaniment=pianoLeftHand(source,chords,beats,right.notes,difficulty);
      notes.push(...accompaniment);
      pianoAccompaniment=accompaniment.length>0;
      trackName=pianoAccompaniment?`${right.name}（右手） + 和弦伴奏（左手）`:`${right.name}（右手）`;
      provenance=pianoAccompaniment?
        '右手为 SheetSage2 提取的旋律；左手按预测和弦与节拍自动编配，不是原曲左手转写。':
        'SheetSage2 未识别到覆盖所选旋律的可用和弦，无法可靠编配左手；当前仅保留右手旋律。';
    }
  }else if(instrument==='guitar'){
    const lead=selected.find(isVocal)||selected[0];
    if(lead)notes.push(...lead.notes.map(note=>({...note,pitch:fitOctave(note.pitch,52,88)})));
    const chordTimes=beats.length?beats.map(beat=>beat.time):chords.map(chord=>chord.start);
    for(const time of chordTimes.slice(0,1400)){
      const chord=activeChord(chords,time);if(!chord)continue;
      const tones=chordTones(chord.label);
      const root=48+tones.root;
      const next=beats.find(beat=>beat.time>time+.15)?.time||Math.min(chord.end,time+.6);
      const duration=Math.max(.2,Math.min(.8,next-time-.05,chord.end-time));
      for(const interval of tones.intervals.slice(0,3))
        notes.push({pitch:root+interval,start:s(time),duration:s(duration),velocity:55});
    }
    if(!notes.length)throw new Error('没有可用旋律或和弦，无法生成吉他改编谱。');
    trackName=lead?`${lead.name} + 和弦改编`:'和弦改编';
    provenance='按 SheetSage2 旋律及和弦生成的吉他练习编配；不是原曲吉他分轨。';
  }else if(instrument==='bass'){
    if(!chords.some(chord=>chordTones(chord.label)))
      throw new Error('SheetSage2 没有识别出可用和弦，无法推算贝斯根音。');
    const times=beats.length?beats.map(beat=>beat.time):chords.map(chord=>chord.start);
    for(let i=0;i<times.length&&i<1600;i++){
      const time=times[i],chord=activeChord(chords,time);if(!chord)continue;
      const beat=beats[i];
      if(beat&&beat.position%2===0&&chord.start<time-.05)continue;
      const root=chordTones(chord.label).root;
      const next=times[i+1]||Math.min(chord.end,time+.8);
      notes.push({pitch:36+root,start:s(time),duration:s(Math.max(.2,Math.min(1.4,next-time,chord.end-time))),velocity:86});
    }
    if(!notes.length)throw new Error('和弦没有形成可用贝斯节奏，请换一段音频。');
    trackName='和弦根音改编';
    provenance='按 SheetSage2 和弦根音及节拍生成的贝斯练习编配；不是原曲贝斯分轨。';
  }else if(instrument==='drums'){
    if(beats.length<2)throw new Error('SheetSage2 没有识别出足够节拍，无法生成基础鼓型。');
    for(let i=0;i<beats.length&&i<1600;i++){
      const beat=beats[i],start=s(beat.time),length=s(.12);
      const snare=beat.numerator===3?beat.position===3:beat.position%2===0;
      notes.push({pitch:snare?38:36,start,duration:length,velocity:snare?84:92});
      notes.push({pitch:42,start,duration:length,velocity:60});
      if(i+1<beats.length&&beats[i+1].time-beat.time>.4)
        notes.push({pitch:42,start:s((beat.time+beats[i+1].time)/2),duration:length,velocity:46});
    }
    trackName='节拍基础鼓型';
    provenance='按 SheetSage2 节拍生成的基础底鼓、军鼓与踩镲；不是原曲鼓点转写。';
  }else throw new Error('MP3 编配乐器无效。');
  return {notes,trackName,provenance,pianoAccompaniment,
    trackIds:['bass','drums'].includes(instrument)?[]:selected.map(track=>track.id)};
}

module.exports={arrangeMp3,parseChords,parseBeats,chordTones};
