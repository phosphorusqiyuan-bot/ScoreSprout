const {chordTones}=require('./mp3-arrangement');

function activeWindows(melody,beatTicks){
  const windows=[];
  for(const n of [...melody].sort((a,b)=>a.start-b.start)){
    const last=windows.at(-1),end=n.start+n.duration;
    if(last&&n.start-last.end<=beatTicks/2)last.end=Math.max(last.end,end);
    else windows.push({start:n.start,end});
  }
  return windows;
}
function nearestPitch(pc,low,high,previous=48){
  const choices=[];
  for(let pitch=low;pitch<=high;pitch++)if((pitch%12+12)%12===pc)choices.push(pitch);
  return choices.sort((a,b)=>Math.abs(a-previous)-Math.abs(b-previous)||a-b)[0];
}
function chooseVoicing(tones,high,count,previous){
  const pcs=new Set(tones.intervals.map(i=>(tones.root+i)%12)),choices=[];
  for(let pitch=43;pitch<=high;pitch++)if(pcs.has(pitch%12))choices.push(pitch);
  const candidates=[];
  function visit(group,index){
    if(group.length===count){
      if(group.at(-1)-group[0]>(count===2?7:12))return;
      if(new Set(group.map(p=>p%12)).size!==group.length)return;
      const cost=group.reduce((sum,p,i)=>sum+(previous.length?
        Math.min(...previous.map(old=>Math.abs(p-old))):Math.abs(p-(48+i*4))),0)+
        Math.abs(group.reduce((s,p)=>s+p,0)/count-51)*.15;
      candidates.push({group:[...group],cost});return;
    }
    for(let i=index;i<choices.length;i++)visit([...group,choices[i]],i+1);
  }
  visit([],0);return candidates.sort((a,b)=>a.cost-b.cost)[0]?.group;
}
function buildLeftHand(chords,melody,{ppq=480,meter=[4,4],pickupTicks=0,style='root',difficulty='beginner',toTick}){
  const [num,den]=meter,unit=ppq*4/den,beat=unit*(den===8&&num%3===0?3:1),bar=unit*num;
  const spacing=difficulty==='beginner'?(num<=3?bar:bar/2):beat;
  const windows=activeWindows(melody,beat),notes=[];
  const stats={rule:'beat-voicing-v2',style,skippedUnknownChords:0,skippedCollisions:0,skippedShortFragments:0,phrases:windows.length};
  if(style==='off')return {notes,stats};
  let previous=[];
  const ordered=[...chords].sort((a,b)=>a.start-b.start);
  for(let ci=0;ci<ordered.length;ci++){
    const chord=ordered[ci],known=/^[A-G][#b]?(?::(?:maj|min|maj7|min7|7|dim|dim7|hdim7|aug|sus2|sus4))?$/.test(chord.label),tones=known?chordTones(chord.label):null;
    if(!tones){stats.skippedUnknownChords++;continue;}
    const chordStart=Math.max(0,Math.round(toTick(chord.start)/30)*30);
    const chordEnd=Math.round(toTick(Math.min(chord.end,ordered[ci+1]?.start??chord.end))/30)*30;
    for(const window of windows){
      const start=Math.max(chordStart,window.start),end=Math.min(chordEnd,window.end);
      if(end-start<30)continue;
      const pulses=[start],firstGrid=Math.ceil((start-pickupTicks)/spacing)*spacing+pickupTicks;
      for(let tick=firstGrid;tick<end;tick+=spacing)if(tick>start+30)pulses.push(tick);
      for(let i=0;i<pulses.length;i++){
        const at=pulses[i],until=Math.min(end,pulses[i+1]??at+spacing);
        const sounding=melody.filter(n=>n.start<until&&n.start+n.duration>at);
        const high=Math.min(59,...sounding.map(n=>n.pitch-3));
        if(high<40){stats.skippedCollisions++;continue;}
        let pitches;
        if(style==='voiced'&&difficulty!=='beginner')
          pitches=chooseVoicing(tones,high,difficulty==='intermediate'?2:3,previous);
        if(!pitches){
          const slot=Math.floor((at-pickupTicks)/spacing);
          const pc=style==='fifth'&&Math.abs(slot%2)===1?(tones.root+tones.intervals[2])%12:tones.root;
          const pitch=nearestPitch(pc,40,high,previous[0]??48);
          if(pitch===undefined){stats.skippedCollisions++;continue;}
          pitches=[pitch];
        }
        const duration=Math.max(30,Math.floor((until-at)/30)*30);
        if(duration<ppq/4){stats.skippedShortFragments++;continue;}
        for(const pitch of pitches)notes.push({pitch,start:at,duration,velocity:52,hand:'left'});
        previous=pitches;
      }
    }
  }
  return {notes,stats};
}
module.exports={buildLeftHand,activeWindows};
