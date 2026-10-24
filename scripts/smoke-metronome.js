const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const args=process.argv.slice(2),stability=args.includes('--stability'),library=args.find(a=>!a.startsWith('--'));
const stage=stability?'stability':'metronome';
const root=path.join(__dirname,'..'),run=fs.mkdtempSync(path.join(root,'.smoke-'+stage+'-')),data=path.join(run,'data');
fs.mkdirSync(data);
if(library)fs.cpSync(path.resolve(library),path.join(data,'library'),{recursive:true});
else{
  const {versionToMusicXML}=require('../src/musicxml'),{versionToMidi}=require('../src/midi');
  const songId='d'.repeat(24),id='piano-full-abc123def456',notes=[];
  for(let i=0;i<8;i++){if(i<4)notes.push({pitch:60+i%4,start:i*480,duration:480,hand:'right',velocity:85});notes.push({pitch:48,start:i*480,duration:480,hand:'left',velocity:70});}
  const version={title:'方案二节拍器试用',trackName:'钢琴',instrument:'piano',difficulty:'full',ppq:480,bpm:120,timeSignature:[4,4],keyFifths:0,keyMode:0,notes,parts:[{instrument:'piano',notes}]};
  const entry={id,songId,instrument:'piano',difficulty:'full',trackName:'钢琴',noteCount:notes.length,generatedAt:new Date().toISOString()};
  const dir=path.join(data,'library',songId,'variants');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify(version));fs.writeFileSync(path.join(dir,id+'.musicxml'),versionToMusicXML(version));fs.writeFileSync(path.join(dir,id+'.mid'),versionToMidi(version));
  fs.writeFileSync(path.join(dir,'..','manifest.json'),JSON.stringify({title:version.title,variants:[entry]}));
}
const result=spawnSync(require('electron'),['.','--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required'],{cwd:root,windowsHide:true,encoding:'utf8',timeout:stability?180000:90000,
  env:{...process.env,SCORESPROUT_TEST_DATA:data,SCORESPROUT_SMOKE_STAGE:stage}});
const report=path.join(data,'smoke-'+stage+'.json');
if(result.error||result.status!==0||!fs.existsSync(report))throw Error(result.error?.message||result.stderr||result.stdout);
console.log(fs.readFileSync(report,'utf8'));console.log(run);
