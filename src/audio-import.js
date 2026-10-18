const {writeMidi}=require('midi-file');

function transcribedNotesToMidi(input) {
  if(!Array.isArray(input)||input.length===0)throw new Error('没有可保存的转写音符。');
  if(input.length>20000)throw new Error('转写音符过多，请缩短音频后重试。');
  const events=[
    {tick:0,order:0,type:'trackName',text:Buffer.from('MP3 钢琴旋律','utf8').toString('latin1')},
    {tick:0,order:0,type:'setTempo',microsecondsPerBeat:500000},
    {tick:0,order:0,type:'timeSignature',numerator:4,denominator:4,metronome:24,thirtyseconds:8},
    {tick:0,order:0,type:'programChange',channel:0,programNumber:0}
  ];
  for(const note of input){
    const {pitch,start,duration,velocity}=note||{};
    if(!Number.isInteger(pitch)||pitch<0||pitch>127||
      !Number.isFinite(start)||start<0||start>600||
      !Number.isFinite(duration)||duration<=0||start+duration>601||
      !Number.isFinite(velocity)||velocity<1||velocity>127)
      throw new Error('转写数据包含无效音符。');
    const begin=Math.round(start*960),end=Math.max(begin+1,Math.round((start+duration)*960));
    events.push({tick:begin,order:2,type:'noteOn',channel:0,noteNumber:pitch,velocity:Math.round(velocity)});
    events.push({tick:end,order:1,type:'noteOff',channel:0,noteNumber:pitch,velocity:0});
  }
  events.sort((a,b)=>a.tick-b.tick||a.order-b.order);
  let tick=0;
  const track=events.map(({tick:at,order,...event})=>{
    const entry={deltaTime:at-tick,...event};tick=at;return entry;
  });
  track.push({deltaTime:0,type:'endOfTrack'});
  return Buffer.from(writeMidi({header:{format:0,numTracks:1,ticksPerBeat:480},tracks:[track]}));
}
module.exports={transcribedNotesToMidi};
