const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');const electron=require('electron');
const runRoot=fs.mkdtempSync(path.join(root,'.smoke-'));
const data=path.join(runRoot,'data'),exportDir=path.join(runRoot,'exports');
const sample=path.join(root,'samples','four-instruments.mid');
if(!fs.existsSync(sample))throw Error('请先运行 pnpm samples 生成示例 MIDI。');
for(const stage of ['create','reload']){
  const result=spawnSync(electron,['.','--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required'],{
    cwd:root,encoding:'utf8',timeout:60000,windowsHide:true,
    env:{...process.env,SCORESPROUT_TEST_DATA:data,SCORESPROUT_TEST_IMPORT:sample,SCORESPROUT_TEST_EXPORT:exportDir,SCORESPROUT_SMOKE_STAGE:stage}
  });
  const report=path.join(data,`smoke-${stage}.json`);
  if(result.error||!fs.existsSync(report))throw Error(`${stage} 阶段失败：${result.error?.message||result.stderr||result.stdout}`);
}
const created=JSON.parse(fs.readFileSync(path.join(data,'smoke-create.json'),'utf8'));
const loaded=JSON.parse(fs.readFileSync(path.join(data,'smoke-reload.json'),'utf8'));
if(created.outcomes.length!==12||created.library!==12||loaded.library!==12||!loaded.svg||!loaded.playbackControls)
  throw Error('验收结果不完整。');
const files=fs.readdirSync(exportDir);if(files.filter(f=>f.endsWith('.mid')).length!==12||files.filter(f=>f.endsWith('.musicxml')).length!==12)
  throw Error('导出数量不正确。');
console.log(`验收通过：12 个版本、12 份谱面、24 个导出文件、重启读取、播放控制。\n结果目录：${runRoot}`);
