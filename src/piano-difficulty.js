function onsetGroups(notes) {
  const groups=new Map();
  for(const note of notes) {
    if(!groups.has(note.start))groups.set(note.start,new Map());
    const pitches=groups.get(note.start),previous=pitches.get(note.pitch);
    if(!previous || note.duration>previous.duration)pitches.set(note.pitch,note);
  }
  return [...groups].sort((a,b)=>a[0]-b[0])
    .map(([start,pitches])=>({start,notes:[...pitches.values()].sort((a,b)=>a.pitch-b.pitch)}));
}

function trimOverlaps(notes) {
  const groups=onsetGroups(notes);
  return groups.flatMap((group,index)=>group.notes.map(note=>({...note,
    duration:Math.min(note.duration,groups[index+1] ? groups[index+1].start-note.start : note.duration)})));
}

function leftPitch(pitch,previous,difficulty) {
  const [low,high]=difficulty==='beginner'?[40,59]:[36,64];
  const choices=[];
  for(let p=low;p<=high;p++)if((p-pitch)%12===0)choices.push(p);
  return choices.sort((a,b)=>
    (Math.abs(a-(previous??pitch))+.15*Math.abs(a-pitch))-
    (Math.abs(b-(previous??pitch))+.15*Math.abs(b-pitch)))[0];
}

function simplifyPianoNotes(notes,difficulty,ppq=480,timeSignature=[4,4]) {
  if(difficulty==='full')return notes;
  const byHand={right:[],left:[]};
  for(const note of notes)byHand[note.hand||(note.pitch<60?'left':'right')].push(note);
  // Reduce simultaneous keys, never collect successive melody attacks into
  // one beat. The highest note of each right-hand onset is the melody proxy.
  const right=trimOverlaps(onsetGroups(byHand.right).flatMap(group=>{
    const top=group.notes.at(-1);
    const lower=difficulty==='intermediate' ? [...group.notes].reverse()
      .find(note=>note.pitch<top.pitch && top.pitch-note.pitch<=12) : null;
    return [top,...(lower?[lower]:[])].map(note=>({...note,hand:'right'}));
  }));
  const [numerator,denominator]=timeSignature;
  const beatTicks=ppq*4/denominator,barTicks=beatTicks*numerator;
  const spacing=difficulty==='beginner' ? (numerator<=3?barTicks:barTicks/2) : beatTicks;
  const slots=new Map();
  for(const group of onsetGroups(byHand.left)) {
    const slot=Math.floor(group.start/spacing);
    if(!slots.has(slot))slots.set(slot,[]);
    slots.get(slot).push(group);
  }
  const left=[];
  let previousPitch=null;
  for(const [slot,groups] of slots) {
    const first=groups[0],bottom=first.notes[0];
    let start=first.start;
    if(difficulty==='beginner') {
      // Small human timing offsets should not create an extra independent
      // left-hand attack. Prefer a nearby melody attack, then a nearby beat.
      const melodyStart=right.filter(note=>Math.floor(note.start/spacing)===slot && Math.abs(note.start-start)<=ppq/4)
        .sort((a,b)=>Math.abs(a.start-start)-Math.abs(b.start-start))[0]?.start;
      const beatStart=Math.round(start/beatTicks)*beatTicks;
      if(melodyStart!==undefined)start=melodyStart;
      else if(Math.floor(beatStart/spacing)===slot && Math.abs(beatStart-start)<=ppq/4)start=beatStart;
    }
    const end=Math.max(bottom.start+bottom.duration,
      Math.min((slot+1)*spacing,Math.max(...groups.flatMap(group=>group.notes.map(note=>note.start+note.duration)))));
    const pitch=leftPitch(bottom.pitch,previousPitch,difficulty);
    const previous=left.at(-1);
    if(difficulty==='beginner' && previous?.pitch===pitch && start-previous.start-previous.duration<=ppq/4) {
      previous.duration=Math.max(previous.duration,end-previous.start);
    }else {
      left.push({...bottom,pitch,start,duration:Math.max(30,end-start),hand:'left'});
      const upper=difficulty==='intermediate' ? first.notes.find(note=>note.pitch>bottom.pitch &&
        note.pitch-bottom.pitch<=12 && note.pitch%12!==bottom.pitch%12) : null;
      if(upper && pitch+upper.pitch-bottom.pitch<=64)left.push({...upper,pitch:pitch+upper.pitch-bottom.pitch,start,
        duration:Math.max(30,Math.min(end,upper.start+upper.duration)-start),hand:'left'});
    }
    previousPitch=pitch;
  }
  return [...right,...trimOverlaps(left)].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
}

function applyPianoDifficulty(version) {
  if(!version.pianoDifficultyPending)return;
  for(const part of version.parts)if(part.instrument==='piano')
    part.notes=simplifyPianoNotes(part.notes,version.difficulty,version.ppq,version.timeSignature);
  version.notes=version.parts.flatMap(part=>part.notes).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  delete version.pianoDifficultyPending;
}

module.exports={simplifyPianoNotes,applyPianoDifficulty};
