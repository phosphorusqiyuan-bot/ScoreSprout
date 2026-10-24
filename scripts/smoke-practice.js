const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),grace=process.argv[2]==='--grace',library=process.argv[2]&&path.resolve(process.argv[2]);
if(!grace&&(!library||!fs.statSync(library).isDirectory()))throw Error('Usage: node scripts/smoke-practice.js <library> | --grace');
const runRoot=fs.mkdtempSync(path.join(root,'.smoke-practice-')),data=path.join(runRoot,'data');
fs.mkdirSync(data);
if(grace){
  const {versionToMusicXML}=require('../src/musicxml'),{versionToMidi}=require('../src/midi');
  const songId='c'.repeat(24),id='piano-full-abcdef123456',n=(pitch,start,duration,hand='right')=>({pitch,start,duration,hand,velocity:90,fingering:hand==='right'?3:2});
  const notes=[n(67,0,420),n(71,420,60),n(72,480,480),n(74,960,480),n(76,1440,480),n(48,0,1920,'left')];
  const version={title:'短倚音与钢琴采样检查',instrument:'piano',difficulty:'full',trackName:'短倚音测试',ppq:480,bpm:100,
    timeSignature:[4,4],keyFifths:0,keyMode:0,notes,parts:[{instrument:'piano',notes}]};
  const entry={id,songId,instrument:'piano',difficulty:'full',trackName:version.trackName,noteCount:notes.length,generatedAt:new Date().toISOString()};
  const dir=path.join(data,'library',songId,'variants');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify(version));fs.writeFileSync(path.join(dir,id+'.musicxml'),versionToMusicXML(version));
  fs.writeFileSync(path.join(dir,id+'.mid'),versionToMidi(version));
  fs.writeFileSync(path.join(dir,'..','manifest.json'),JSON.stringify({title:version.title,variants:[entry]}));
}else fs.cpSync(library,path.join(data,'library'),{recursive:true});
const result=spawnSync(require('electron'),['.','--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required'],{
  cwd:root,windowsHide:true,encoding:'utf8',timeout:60000,
  env:{...process.env,SCORESPROUT_TEST_DATA:data,SCORESPROUT_SMOKE_STAGE:'practice',SCORESPROUT_TEST_EXPORT:path.join(runRoot,'exports')}
});
const report=path.join(data,'smoke-practice.json');
if(result.error||result.status!==0||!fs.existsSync(report))throw Error(result.error?.message||result.stderr||result.stdout);
console.log(fs.readFileSync(report,'utf8'));console.log(runRoot);
