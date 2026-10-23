// Infer a regular onset grid only when the passage supplies enough evidence.
// Irregular passages keep the fine grid, avoiding cumulative tempo changes.
function tidyRhythm(notes,{ppq=480,bpm=120,inputType,difficulty}={}) {
  const starts=[...new Set(notes.map(note=>note.start))].sort((a,b)=>a-b);
  const ticksPerSecond=ppq*bpm/60;
  const tolerance=Math.min(inputType==='mp3'?48:difficulty==='full'?24:36,
    ticksPerSecond*(inputType==='mp3'?.055:.03));
  let grid=30;
  if(starts.length>=3 && starts.at(-1)-starts[0]>=ppq) {
    for(const candidate of [ppq,ppq/2,ppq/4,ppq/8]) {
      const mapped=starts.map(start=>Math.round(start/candidate)*candidate);
      const fit=starts.filter((start,i)=>Math.abs(start-mapped[i])<=tolerance).length/starts.length;
      const collision=starts.some((start,i)=>i>0 && mapped[i]===mapped[i-1] && start-starts[i-1]>tolerance*2);
      if(fit>=.9 && !collision){grid=candidate;break;}
    }
  }
  const endTolerance=Math.min(ppq*.2,ticksPerSecond*.1);
  const simple=[30,60,90,120,180,240,360,480,720,960,1440,1920,2880,3840].map(value=>value*ppq/480);
  const regular=new Set([30,60,120,240,480,960,1920,3840].map(value=>value*ppq/480));
  const prepared=notes.map(note=>{
    const step=grid>30 && Math.abs(note.start-Math.round(note.start/grid)*grid)<=tolerance?grid:30;
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
        const candidates=[...simple,Math.max(ppq,Math.round(duration/ppq)*ppq)];
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

module.exports={tidyRhythm};
