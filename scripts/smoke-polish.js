const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {writeMidi}=require('midi-file');
const root=path.join(__dirname,'..'),runRoot=fs.mkdtempSync(path.join(root,'.smoke-polish-'));
const data=path.join(runRoot,'data'),file=path.join(runRoot,'rhythm.mid');
const notes=[{pitch:72,start:0,duration:1920},
  ...[0,480,960,1440].map((start,i)=>({pitch:76+i%2,start,duration:470})),
  {pitch:74,start:1920,duration:720},{pitch:76,start:2640,duration:240},{pitch:77,start:2880,duration:960}];
const events=[{tick:0,type:'programChange',channel:0,programNumber:40}];
for(const note of notes)events.push({tick:note.start,type:'noteOn',channel:0,noteNumber:note.pitch,velocity:80},
  {tick:note.start+note.duration,type:'noteOff',channel:0,noteNumber:note.pitch,velocity:0});
events.sort((a,b)=>a.tick-b.tick);
let tick=0;
const track=events.map(({tick:at,...event})=>{const e={...event,deltaTime:at-tick};tick=at;return e;});
track.push({deltaTime:0,type:'endOfTrack'});
fs.writeFileSync(file,Buffer.from(writeMidi({header:{format:0,numTracks:1,ticksPerBeat:480},tracks:[track]})));
for(const stage of ['polish','polish-reload']) {
  const result=spawnSync(require('electron'),['.','--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required'],{
    cwd:root,windowsHide:true,encoding:'utf8',timeout:60000,
    env:{...process.env,SCORESPROUT_TEST_DATA:data,SCORESPROUT_TEST_IMPORT:file,SCORESPROUT_SMOKE_STAGE:stage}
  });
  const report=path.join(data,`smoke-${stage}.json`);
  if(result.error||result.status!==0||!fs.existsSync(report))throw Error(result.error?.message||result.stderr||result.stdout);
  console.log(stage,fs.readFileSync(report,'utf8'));
}
console.log(`界面、重新生成、配色持久化与实际音量衰减检查通过：${runRoot}`);
