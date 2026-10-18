const fs=require('node:fs');const path=require('node:path');const {writeMidi}=require('midi-file');
const dir=path.join(__dirname,'..','samples');fs.mkdirSync(dir,{recursive:true});
function makeTrack(name,program,channel,notes,meta=false) {
  const events=[{tick:0,order:0,type:'trackName',text:Buffer.from(name,'utf8').toString('latin1')}];
  if(meta) events.push({tick:0,order:0,type:'setTempo',microsecondsPerBeat:500000},{tick:0,order:0,type:'timeSignature',numerator:4,denominator:4,metronome:24,thirtyseconds:8},{tick:0,order:0,type:'keySignature',key:0,scale:0});
  if(channel!==9)events.push({tick:0,order:0,type:'programChange',channel,programNumber:program});
  for(const [start,duration,pitch,velocity=85] of notes){events.push({tick:start,order:2,type:'noteOn',channel,noteNumber:pitch,velocity},{tick:start+duration,order:1,type:'noteOff',channel,noteNumber:pitch,velocity:0});}
  events.sort((a,b)=>a.tick-b.tick||a.order-b.order);let tick=0;
  const track=events.map(({tick:t,order,...rest})=>{const e={deltaTime:t-tick,...rest};tick=t;return e;});track.push({deltaTime:0,type:'endOfTrack'});return track;
}
function save(name,tracks){fs.writeFileSync(path.join(dir,name),Buffer.from(writeMidi({header:{format:tracks.length>1?1:0,numTracks:tracks.length,ticksPerBeat:480},tracks})));}
const piano=[],guitar=[],bass=[],drums=[];const melody=[60,62,64,67,69,67,64,62];
for(let bar=0;bar<4;bar++)for(let beat=0;beat<4;beat++){
  const t=bar*1920+beat*480;
  piano.push([t,390,melody[(bar*4+beat)%8],94],[t,410,[48,53,55,48][bar],70]);
  if(beat%2===0)piano.push([t,420,[64,65,67,64][bar],58]);
  if(beat===0||beat===2)for(const p of [52,55,60])guitar.push([t,780,p+(bar%2?2:0),72]);
  bass.push([t,420,[36,41,43,36][bar]+(beat===3?7:0),82]);
  drums.push([t,100,beat===0||beat===2?36:38,105],[t,100,42,65],[t+240,100,42,50]);
}
save('piano.mid',[makeTrack('Piano demo',0,0,piano,true)]);
save('guitar.mid',[makeTrack('Guitar demo',24,1,guitar,true)]);
save('bass.mid',[makeTrack('Bass demo',33,2,bass,true)]);
save('drums.mid',[makeTrack('Drum demo',0,9,drums,true)]);
save('four-instruments.mid',[makeTrack('ScoreSprout 示例',0,0,[],true),makeTrack('Piano',0,0,piano),makeTrack('Guitar',24,1,guitar),makeTrack('Bass',33,2,bass),makeTrack('Drums',0,9,drums)]);
save('no-tempo.mid',[makeTrack('无速度示例',0,0,piano)]);
// 单轨中两个通道使用不同乐器，验证拆分识别。
const mixed=makeTrack('Mixed',0,0,piano,true).filter(e=>e.type!=='endOfTrack');let abs=0;const a=mixed.map(e=>{abs+=e.deltaTime;return {tick:abs,...e}});
for(const e of makeTrack('Bass',33,2,bass)){if(e.type==='endOfTrack'||e.type==='trackName')continue;}
const mergedEvents=[];let t2=0;for(const e of makeTrack('Bass',33,2,bass)){t2+=e.deltaTime;if(e.type==='endOfTrack'||e.type==='trackName')continue;mergedEvents.push({tick:t2,...e});}
const all=a.concat(mergedEvents).sort((x,y)=>x.tick-y.tick);let last=0;const merged=all.map(({tick,...e})=>{const r={...e,deltaTime:tick-last};last=tick;return r;});merged.push({deltaTime:0,type:'endOfTrack'});save('mixed-track.mid',[merged]);
console.log(`已生成 ${fs.readdirSync(dir).filter(x=>x.endsWith('.mid')).length} 个示例 MIDI：${dir}`);
