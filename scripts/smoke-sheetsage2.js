const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const electron=require('electron');
const audio=path.join(root,'samples','sheetsage2-melody.mp3');
if(!fs.existsSync(path.join(root,'.sheetsage2-runtime','ready')))
  throw Error('请先双击「安装 SheetSage2.cmd」。');
if(!fs.existsSync(audio))throw Error('缺少 samples/sheetsage2-melody.mp3。');
const runRoot=fs.mkdtempSync(path.join(root,'.smoke-sheetsage2-'));
const data=path.join(runRoot,'data'),exportDir=path.join(runRoot,'exports');
fs.mkdirSync(data,{recursive:true});
function run(stage){
  const result=spawnSync(electron,['.','--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required'],{
    cwd:root,encoding:'utf8',timeout:180000,windowsHide:true,
    env:{...process.env,SCORESPROUT_TEST_DATA:data,SCORESPROUT_TEST_IMPORT_MP3:audio,
      SCORESPROUT_TEST_EXPORT:exportDir,SCORESPROUT_SMOKE_STAGE:stage}
  });
  const report=path.join(data,`smoke-${stage}.json`);
  if(result.error||result.status!==0||!fs.existsSync(report))
    throw Error(`SheetSage2 ${stage} 测试失败：${result.error?.message||result.stderr||result.stdout}`);
  return JSON.parse(fs.readFileSync(report,'utf8'));
}
const summary=run('mp3-real');
if(!summary.scoreRendered||!fs.existsSync(summary.rawMidi)||
  ['piano','guitar','bass','drums'].some(id=>!fs.existsSync(summary.generated?.[id]?.midi||'')||
    !fs.existsSync(summary.generated?.[id]?.xml||'')))
  throw Error('SheetSage2 谱面或 MIDI 导出缺失。');
const reloaded=run('mp3-real-reload');
if(!reloaded.persisted||reloaded.songId!==summary.songId||
  ['piano','guitar','bass','drums'].some(id=>reloaded.found?.[id]!==summary.generated[id].id))
  throw Error('SheetSage2 乐谱重启读取失败。');
console.log(`SheetSage2 端到端通过：MP3 导入、旋律提取、四种乐器谱面与 MIDI/MusicXML 导出、重启读取（预期 16 音，输出 ${summary.pitches.length} 音）。\n结果目录：${runRoot}`);
