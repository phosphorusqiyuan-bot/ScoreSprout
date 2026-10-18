const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');const electron=require('electron');
const runRoot=fs.mkdtempSync(path.join(root,'.smoke-'));
const data=path.join(runRoot,'data'),exportDir=path.join(runRoot,'exports');
const sample=path.join(root,'samples','four-instruments.mid');
if(!fs.existsSync(sample))throw Error('请先运行 pnpm samples 生成示例 MIDI。');
for(const stage of ['create','reload','delete','deleted','mp3','mp3-reload']){
  const result=spawnSync(electron,['.','--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required'],{
    cwd:root,encoding:'utf8',timeout:60000,windowsHide:true,
    env:{...process.env,SCORESPROUT_TEST_DATA:data,SCORESPROUT_TEST_IMPORT:sample,
      SCORESPROUT_TEST_IMPORT_MP3:path.join(root,'samples','440hz-test.mp3'),
      SCORESPROUT_TEST_EXPORT:exportDir,SCORESPROUT_SMOKE_STAGE:stage}
  });
  const report=path.join(data,`smoke-${stage}.json`);
  if(result.error||!fs.existsSync(report))throw Error(`${stage} 阶段失败：${result.error?.message||result.stderr||result.stdout}`);
}
const created=JSON.parse(fs.readFileSync(path.join(data,'smoke-create.json'),'utf8'));
const loaded=JSON.parse(fs.readFileSync(path.join(data,'smoke-reload.json'),'utf8'));
const removed=JSON.parse(fs.readFileSync(path.join(data,'smoke-delete.json'),'utf8'));
const afterDelete=JSON.parse(fs.readFileSync(path.join(data,'smoke-deleted.json'),'utf8'));
const mp3=JSON.parse(fs.readFileSync(path.join(data,'smoke-mp3.json'),'utf8'));
const mp3Reload=JSON.parse(fs.readFileSync(path.join(data,'smoke-mp3-reload.json'),'utf8'));
if(created.outcomes.length!==13||created.library!==13||loaded.library!==13||!loaded.svg||!loaded.playbackControls||!loaded.ensemble)
  throw Error('验收结果不完整。');
const files=fs.readdirSync(exportDir);if(files.filter(f=>f.endsWith('.mid')).length!==15||files.filter(f=>f.endsWith('.musicxml')).length!==13)
  throw Error('导出数量不正确。');
if(!removed.cancel||!removed.playbackCleared||!afterDelete.deletionPersisted||!afterDelete.otherScore)
  throw Error('删除验收未通过。');
const songDir=path.join(data,'library',removed.songId);
for(const ext of ['json','mid','musicxml'])
  if(fs.existsSync(path.join(songDir,'variants',`${removed.deleted}.${ext}`)))throw Error('已删除版本的文件仍在音乐库中。');
if(!fs.existsSync(path.join(songDir,'original.mid')))throw Error('原始 MIDI 丢失。');
const audioDir=path.join(data,'library',mp3.songId);
if(!mp3.rendered||!mp3Reload.persisted||mp3Reload.songId!==mp3.songId||
  !fs.existsSync(path.join(audioDir,'original.mp3'))||!fs.existsSync(path.join(audioDir,'original.mid')))
  throw Error('MP3 转写或保存验收未通过。');
console.log(`验收通过：MIDI 与 MP3 导入、转写、谱面、导出、删除与重启验证。\n结果目录：${runRoot}`);
