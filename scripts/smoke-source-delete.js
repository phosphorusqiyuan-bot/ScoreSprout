const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {analyzeMidi,generateVersion,versionToMidi}=require('../src/midi'),{versionToMusicXML}=require('../src/musicxml');
const root=path.resolve(__dirname,'..'),run=fs.mkdtempSync(path.join(root,'.smoke-source-delete-')),data=path.join(run,'data');
const sample=path.join(root,'samples','four-instruments.mid'),bytes=fs.readFileSync(sample);
const songId='e'.repeat(24),id='piano-full-abcdef123456',dir=path.join(data,'library',songId,'variants');
fs.mkdirSync(dir,{recursive:true});
const source=analyzeMidi(bytes,'受保护.mid'),version=generateVersion(source,[source.tracks[0].id],'auto','full','已生成的歌曲');
fs.writeFileSync(path.join(dir,'..','original.mid'),bytes);
fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify(version));
fs.writeFileSync(path.join(dir,id+'.musicxml'),versionToMusicXML(version));fs.writeFileSync(path.join(dir,id+'.mid'),versionToMidi(version));
fs.writeFileSync(path.join(dir,'..','manifest.json'),JSON.stringify({title:version.title,filename:'受保护.mid',createdAt:new Date().toISOString(),
  variants:[{id,songId,title:version.title,instrument:version.instrument,difficulty:'full',trackName:'钢琴',generatedAt:new Date().toISOString()}]}));
let passed=false;
try {
  for(const stage of ['source-delete','source-delete-reload']) {
    const result=spawnSync(require('electron'),['.','--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required'],{
      cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,
      env:{...process.env,SCORESPROUT_TEST_DATA:data,SCORESPROUT_TEST_IMPORT:sample,SCORESPROUT_SMOKE_STAGE:stage}
    });
    const report=path.join(data,`smoke-${stage}.json`);
    if(result.error||result.status!==0||!fs.existsSync(report))throw Error(result.error?.message||result.stderr||result.stdout);
    console.log(fs.readFileSync(report,'utf8'));
  }
  if(!fs.readFileSync(sample).equals(bytes))throw Error('外部导入文件被改动');
  passed=true;
} finally {
  if(passed&&path.dirname(path.resolve(run))===root&&path.basename(run).startsWith('.smoke-source-delete-'))
    fs.rmSync(run,{recursive:true,force:true});
}
