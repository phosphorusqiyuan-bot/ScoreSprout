const {versionToMusicXML}=require('./musicxml');
const {layoutMusicXML}=require('./score-layout');

// Read existing PianoPlayer annotations by attack, not by XML note index: ties
// and multiple voices make indices unstable after a change of written rhythm.
function readFingerings(xml){
  const result=new Map();
  for(const [partIndex,part] of [...xml.matchAll(/<part\s[^>]*>[\s\S]*?<\/part>/g)].entries()){
    let measureStart=0;
    for(const match of part[0].matchAll(/<measure\b[^>]*>[\s\S]*?<\/measure>/g)){
      let position=0,lastStart=0,length=0;
      for(const item of match[0].matchAll(/<note\b[^>]*>[\s\S]*?<\/note>|<(backup|forward)>[\s\S]*?<\/\1>/g)){
        const text=item[0],duration=Number(text.match(/<duration>(\d+)<\/duration>/)?.[1]||0);
        if(!text.startsWith('<note')){position+=text.startsWith('<backup>')?-duration:duration;continue;}
        const chord=/<chord\s*\/>/.test(text),grace=/<grace\b/.test(text),start=chord?lastStart:position;
        if(!chord&&!grace){lastStart=start;position+=duration;}length=Math.max(length,position);
        const fingering=text.match(/<fingering\b[^>]*>([1-5])<\/fingering>/)?.[1];
        const step=text.match(/<step>([A-G])<\/step>/)?.[1],octave=Number(text.match(/<octave>(-?\d+)<\/octave>/)?.[1]);
        if(fingering&&step&&!/<tie\s[^>]*type="stop"/.test(text)){
          const pitch=(octave+1)*12+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[step]+Number(text.match(/<alter>(-?\d+)<\/alter>/)?.[1]||0);
          const staff=Number(text.match(/<staff>(\d+)<\/staff>/)?.[1]||1);
          result.set([partIndex,measureStart+start,pitch,staff].join(':'),Number(fingering));
        }
      }
      measureStart+=length;
    }
  }
  return result;
}

function readableScore(source,originalXML){
  const version=structuredClone(source),stats={adjusted:0,graceNotes:0,preservedFastAttacks:0,omittedAccompanimentFragments:0};
  const fingerings=readFingerings(originalXML),grid=120;
  const [num,den]=version.timeSignature,bar=version.ppq*4*num/den,pickup=version.rhythmProcessing?.pickupTicks||0;
  const measureAt=t=>t<pickup?-1:Math.floor((t-pickup)/bar);
  const snap=t=>{
    const base=t<pickup?0:pickup+Math.floor((t-pickup)/bar)*bar;
    return Math.max(base,base+Math.round((t-base)/grid)*grid);
  };
  const parts=version.parts?.length?version.parts:[{instrument:version.instrument,notes:version.notes}];
  for(const [partIndex,part] of parts.entries()){
    const notes=part.notes.map(n=>({...n,performanceStart:n.start}));
    for(const n of notes){
      const staff=part.instrument==='piano'?(n.hand==='left'||(!n.hand&&n.pitch<60)?2:1):1;
      n.fingering=fingerings.get([partIndex,n.start,n.pitch,staff].join(':'));
    }
    // This is a conservative engraving reduction for piano, never a rewrite
    // of the saved performance or MIDI. Other instruments keep their rhythms.
    if(part.instrument!=='piano'){part.notes=notes;continue;}
    for(const hand of ['left','right']){
      const line=notes.filter(n=>(n.hand||(n.pitch<60?'left':'right'))===hand).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
      const groups=[];
      for(const n of line){if(groups.at(-1)?.start!==n.start)groups.push({start:n.start,notes:[]});groups.at(-1).notes.push(n);}
      // Old auto-accompaniment can contain a 30/60-tick root just before a
      // chord boundary. It is generated debris, not a sung melody ornament.
      if(hand==='left'&&source.mp3PianoAccompaniment)for(let i=0;i<groups.length-1;i++){
        const group=groups[i],next=groups[i+1];
        if(next.start-group.start<=120&&group.notes.every(n=>n.duration<120&&n.start+n.duration<=next.start+30)){
          group.fragment=true;stats.omittedAccompanimentFragments+=group.notes.length;
        }
      }
      // Only an isolated, short, stepwise approach into a longer note qualifies.
      // Repeated attacks, chords, strong-beat notes and fast runs stay measured.
      for(let i=0;i<groups.length-1;i++){
        const group=groups[i],next=groups[i+1],n=group.notes[0],host=next.notes[0],previous=groups[i-1];
        const beat=version.ppq*4/den*(den===8&&num>3&&num%3===0?3:1);
        if(!group.fragment&&!next.fragment&&group.notes.length===1&&next.notes.length===1&&n.duration<=90&&host.duration>=240&&
          next.start>group.start&&next.start-group.start<=120&&Math.abs(n.start+n.duration-next.start)<=30&&
          Math.abs(n.pitch-host.pitch)>0&&Math.abs(n.pitch-host.pitch)<=4&&measureAt(n.start)===measureAt(host.start)&&
          ((n.start-pickup)%beat+beat)%beat!==0&&(!previous||group.start-previous.start>=120)){
          host.graceBefore=[{...n}];host.performanceStart=n.performanceStart;group.ornament=true;stats.graceNotes++;
        }
      }
      const ordinary=groups.filter(group=>!group.ornament&&!group.fragment);
      // A grid collision represents real separate attacks. Retain local timing
      // instead of deleting a note or misrepresenting it as a chord.
      for(let i=1;i<ordinary.length;i++)if(snap(ordinary[i-1].start)===snap(ordinary[i].start)){
        ordinary[i-1].precise=true;ordinary[i].precise=true;
      }
      for(let i=0;i<ordinary.length;i++){
        const group=ordinary[i],next=ordinary[i+1];
        for(const n of group.notes){
          const oldStart=n.start,oldEnd=n.start+n.duration;
          const start=group.precise?n.start:snap(n.start);
          let end=group.precise?oldEnd:Math.max(start+grid,snap(oldEnd));
          // Close a sub-grid articulation gap, but retain intentional rests and
          // actual overlapping voices. Never extend across the next attack.
          if(next&&oldEnd<=next.start+30&&next.start-oldEnd<=90)end=next.precise?next.start:snap(next.start);
          if(end<=start){end=oldEnd;stats.preservedFastAttacks++;}
          if(group.precise)stats.preservedFastAttacks++;
          n.start=start;n.duration=end-start;
          if(n.start!==oldStart||n.start+n.duration!==oldEnd)stats.adjusted++;
        }
      }
      for(const group of groups.filter(g=>g.ornament||g.fragment))for(const n of group.notes)n.omitFromNotation=true;
    }
    part.notes=notes.filter(n=>!n.omitFromNotation).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  }
  version.parts=parts;version.notes=parts.flatMap(p=>p.notes).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  version.readability=stats;
  return {version,musicxml:layoutMusicXML(versionToMusicXML(version)),stats};
}
module.exports={readableScore,readFingerings};
