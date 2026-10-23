const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {rhythmMismatchMidi}=require('../test/fixtures/rhythm-mismatch');
const root=path.join(__dirname,'..'),runRoot=fs.mkdtempSync(path.join(root,'.smoke-rhythm-case-'));
const data=path.join(runRoot,'data'),fixture=path.join(runRoot,'rhythm-mismatch.mid');
fs.writeFileSync(fixture,rhythmMismatchMidi());
const file=process.argv[2]?path.resolve(process.argv[2]):fixture;
const result=spawnSync(require('electron'),['.','--no-sandbox','--disable-gpu'],{
  cwd:root,windowsHide:true,encoding:'utf8',timeout:90000,
  env:{...process.env,SCORESPROUT_TEST_DATA:data,SCORESPROUT_TEST_IMPORT:file,SCORESPROUT_SMOKE_STAGE:'rhythm-case'}
});
const report=path.join(data,'smoke-rhythm-case.json');
if(result.error||result.status!==0||!fs.existsSync(report))throw Error(result.error?.message||result.stderr||result.stdout);
console.log(fs.readFileSync(report,'utf8'));
console.log(`真实窗口节拍与光标检查通过：${runRoot}`);
