function phaseLock(starts,grid) {
  let real=0,imaginary=0;
  for(const start of starts) {
    const angle=start/grid*2*Math.PI;
    real+=Math.cos(angle);imaginary+=Math.sin(angle);
  }
  return Math.hypot(real,imaginary)/starts.length;
}

function estimateScoreTempo(notes,{ppq=480,bpm=120}={}) {
  const starts=[...new Set(notes.map(note=>note.start))].sort((a,b)=>a-b);
  if(starts.length<64 || starts.at(-1)-starts[0]<ppq*16)return null;
  const original=phaseLock(starts,ppq/4);
  if(original>=.6)return null;
  // A short excerpt gives a broad search peak; the complete piece then
  // resolves it precisely enough that the grid will not drift in later bars.
  const excerpt=starts.filter(start=>start<=starts[0]+ppq*64);
  let beat=ppq,best=0;
  for(let candidate=ppq*.92;candidate<=ppq*1.08;candidate+=ppq/1920) {
    const strength=phaseLock(excerpt,candidate/4);
    if(strength>best){best=strength;beat=candidate;}
  }
  const center=beat;
  best=0;
  for(let candidate=center-ppq/480;candidate<=center+ppq/480;candidate+=ppq/48000) {
    const strength=phaseLock(starts,candidate/4);
    if(strength>best){best=strength;beat=candidate;}
  }
  const estimated=Math.round(bpm*ppq/beat*100)/100,scale=estimated/bpm;
  if(best<.72 || best-original<.25 || Math.abs(estimated-bpm)<.05)return null;
  const fit=starts.filter(start=>Math.abs(start*scale-Math.round(start*scale/(ppq/4))*(ppq/4))<=ppq*.05).length/starts.length;
  const midpoint=Math.floor(starts.length/2);
  if(fit<.9 || phaseLock(starts.slice(0,midpoint),ppq/4/scale)<.6 ||
    phaseLock(starts.slice(midpoint),ppq/4/scale)<.6)return null;
  // Audio-derived MIDI may also carry leading silence before its beat grid.
  // A short opening measure preserves that silence and the playback timeline
  // while moving subsequent barlines onto the actual musical beats.
  const bins=Array(4).fill(0),chords=new Map();
  for(const note of notes) {
    const start=note.start*scale,nearest=Math.round(start/(ppq/4))*(ppq/4);
    if(Math.abs(start-nearest)>ppq*.05)continue;
    bins[((Math.round(nearest/(ppq/4))%4)+4)%4]++;
    chords.set(nearest,(chords.get(nearest)||0)+1);
  }
  let pickupTicks=0;
  const total=bins.reduce((a,b)=>a+b,0);
  if((bins[1]+bins[3])/total>.75 && (bins[0]+bins[2])/total<.25) {
    const firstChord=[...chords].sort((a,b)=>a[0]-b[0]).find(([start,count])=>
      count>=3 && Math.round(start/(ppq/4))%2===1);
    if(firstChord)pickupTicks=firstChord[0]%ppq;
  }
  // The caller scales both ticks and BPM by this ratio. Wall-clock playback
  // stays at the original speed while the notation gets a meaningful beat.
  return {sourceBpm:bpm,scoreBpm:estimated,confidence:Number(best.toFixed(3)),...(pickupTicks?{pickupTicks}:{})};
}

// Infer a regular onset grid only when the passage supplies enough evidence.
// Irregular passages keep the fine grid, avoiding cumulative tempo changes.
function tidyRhythm(notes,{ppq=480,bpm=120,inputType,difficulty,recoveredTempo=false}={}) {
  const starts=[...new Set(notes.map(note=>note.start))].sort((a,b)=>a-b);
  const ticksPerSecond=ppq*bpm/60;
  const tolerance=Math.min(inputType==='mp3'?48:recoveredTempo?36:difficulty==='full'?24:36,
    ticksPerSecond*(inputType==='mp3'?.055:recoveredTempo?.05:.03));
  let grid=30;
  if(starts.length>=3 && starts.at(-1)-starts[0]>=ppq) {
    for(const candidate of [ppq,ppq/2,ppq/4,ppq/8]) {
      const mapped=starts.map(start=>Math.round(start/candidate)*candidate);
      const fit=starts.filter((start,i)=>Math.abs(start-mapped[i])<=tolerance).length/starts.length;
      if(fit>=.9){grid=candidate;break;}
    }
  }
  const endTolerance=Math.min(ppq*.2,ticksPerSecond*.1);
  const simple=[30,60,90,120,180,240,360,480,720,960,1440,1920,2880,3840].map(value=>value*ppq/480);
  const regular=new Set([30,60,120,240,480,960,1920,3840].map(value=>value*ppq/480));
  const prepared=notes.map(note=>{
    const distance=Math.abs(note.start-Math.round(note.start/grid)*grid);
    const shortAttack=note.duration<=ppq/8 && distance>ppq*.05;
    const step=grid>30 && !shortAttack && distance<=tolerance?grid:30;
    return {...note,start:Math.max(0,Math.round(note.start/step)*step)};
  });
  const lanes=new Map();
  for(const note of prepared) {
    const lane=note.hand||note.sourceTrackId||'part';
    if(!lanes.has(lane))lanes.set(lane,[]);
    lanes.get(lane).push(note.start);
  }
  for(const [lane,values] of lanes)lanes.set(lane,[...new Set(values)].sort((a,b)=>a-b));
  return prepared.map(note=>{
    let duration=note.duration;
    if(grid>30 && duration>=ppq*3/16) {
      const lane=lanes.get(note.hand||note.sourceTrackId||'part');
      let low=0,high=lane.length;
      while(low<high){const mid=(low+high)>>1;if(lane[mid]<=note.start)low=mid+1;else high=mid;}
      const next=lane[low],gap=next-note.start-duration;
      if(gap>=0 && gap<=endTolerance && duration>=(next-note.start)*.75)duration=next-note.start;
      else {
        const candidates=[...simple,Math.max(ppq/4,Math.round(duration/(ppq/4))*(ppq/4)),
          Math.max(ppq,Math.round(duration/ppq)*ppq)];
        candidates.sort((a,b)=>Math.abs(a-duration)-Math.abs(b-duration)||Number(regular.has(b))-Number(regular.has(a))||b-a);
        if(Math.abs(candidates[0]-duration)<=endTolerance) {
          duration=candidates[0];
          if(next!==undefined && note.start+note.duration<=next)duration=Math.min(duration,next-note.start);
        }
      }
    }
    return {...note,duration:Math.max(30,Math.round(duration/30)*30)};
  });
}

module.exports={tidyRhythm,estimateScoreTempo};
