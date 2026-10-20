// Krumhansl-Schmuckler pitch-class profiles, as used by music21's
// key.krumhansl analysis. Keeping this small calculation in JavaScript makes
// key detection available to MIDI-only users without a Python installation.
const MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
const MAJOR_FIFTHS = [0,-5,2,-3,4,-1,6,1,-4,3,-2,5];
const MINOR_FIFTHS = [-3,4,-1,6,1,-4,3,-2,5,0,-5,2];

function correlation(histogram, profile, tonic) {
  const meanX = histogram.reduce((a,b) => a+b,0)/12;
  const meanY = profile.reduce((a,b) => a+b,0)/12;
  let numerator=0, squareX=0, squareY=0;
  for(let pc=0;pc<12;pc++) {
    const x=histogram[pc]-meanX, y=profile[(pc-tonic+12)%12]-meanY;
    numerator+=x*y; squareX+=x*x; squareY+=y*y;
  }
  return squareX && squareY ? numerator/Math.sqrt(squareX*squareY) : 0;
}

function inferKey(tracks, ppq) {
  const histogram=Array(12).fill(0);
  let noteCount=0, totalBeats=0;
  for(const track of tracks) {
    if(track.channel===9 || track.detected==='drums') continue;
    for(const note of track.notes || []) {
      if(!Number.isInteger(note.pitch) || note.pitch<0 || note.pitch>127 || !Number.isFinite(note.duration) || note.duration<=0) continue;
      const beats=note.duration/(ppq || 480);
      histogram[note.pitch%12]+=beats;
      totalBeats+=beats; noteCount++;
    }
  }
  const pitchClasses=histogram.filter(x=>x>0).length;
  if(noteCount<8 || pitchClasses<4 || totalBeats<4) return null;
  const candidates=[];
  for(const [mode,profile,fifths] of [[0,MAJOR,MAJOR_FIFTHS],[1,MINOR,MINOR_FIFTHS]])
    for(let tonic=0;tonic<12;tonic++)
      candidates.push({fifths:fifths[tonic],mode,tonic,correlation:correlation(histogram,profile,tonic)});
  candidates.sort((a,b)=>b.correlation-a.correlation);
  const best=candidates[0], runnerUp=candidates[1];
  // A high correlation alone can still favor two nearly identical keys.
  if(best.correlation<0.55 || best.correlation-runnerUp.correlation<0.05) return null;
  return {fifths:best.fifths,mode:best.mode,correlation:Number(best.correlation.toFixed(3)),
    margin:Number((best.correlation-runnerUp.correlation).toFixed(3)),noteCount,method:'Krumhansl-Schmuckler'};
}

module.exports={inferKey};
