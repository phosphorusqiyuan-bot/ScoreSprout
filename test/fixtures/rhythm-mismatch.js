const {writeMidi}=require('midi-file');

// A generated recording-style fixture, not a copy of any user's song. Notes
// follow 97 BPM but the MIDI header says 95, and timestamps use 32 ms frames.
function rhythmMismatchSource({sourceBpm=95,actualBpm=97,bars=32}={}) {
  const scale=actualBpm/sourceBpm,frame=480*sourceBpm/60*.032;
  const stamp=ticks=>Math.round(Math.round(ticks/scale/frame)*frame);
  const notes=[];
  for(let i=0;i<bars*8;i++) {
    const start=stamp(360+i*240);
    notes.push({pitch:72+[0,2,4,7][i%4],start,duration:stamp(240),velocity:85});
    if(i%8===0)for(const pitch of [48,55,60])
      notes.push({pitch,start,duration:stamp(960),velocity:65});
  }
  notes.sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  return {title:'节拍元数据偏差示例',sourcePpq:480,bpm:sourceBpm,timeSignature:[4,4],keyFifths:0,keyMode:0,
    tracks:[{id:'piano',name:'Piano',detected:'piano',notes}]};
}

function rhythmMismatchMidi() {
  const source=rhythmMismatchSource(),events=[
    {tick:0,type:'setTempo',microsecondsPerBeat:Math.round(60000000/source.bpm)},
    {tick:0,type:'timeSignature',numerator:4,denominator:4,metronome:24,thirtyseconds:8},
    {tick:0,type:'programChange',channel:0,programNumber:0}
  ];
  for(const note of source.tracks[0].notes)events.push(
    {tick:note.start,type:'noteOn',channel:0,noteNumber:note.pitch,velocity:note.velocity},
    {tick:note.start+note.duration,type:'noteOff',channel:0,noteNumber:note.pitch,velocity:0});
  events.sort((a,b)=>a.tick-b.tick);
  let tick=0;
  const track=events.map(({tick:at,...event})=>{const e={deltaTime:at-tick,...event};tick=at;return e;});
  track.push({deltaTime:0,type:'endOfTrack'});
  return Buffer.from(writeMidi({header:{format:0,numTracks:1,ticksPerBeat:480},tracks:[track]}));
}

module.exports={rhythmMismatchSource,rhythmMismatchMidi};
