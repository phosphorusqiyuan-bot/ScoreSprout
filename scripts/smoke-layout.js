const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),library=process.argv[2]&&path.resolve(process.argv[2]);
if(!library||!fs.statSync(library).isDirectory())throw Error('用法：node scripts/smoke-layout.js <已有音乐库目录>');
const runRoot=fs.mkdtempSync(path.join(root,'.smoke-layout-')),data=path.join(runRoot,'data');
fs.mkdirSync(data);fs.cpSync(library,path.join(data,'library'),{recursive:true});
const result=spawnSync(require('electron'),['.','--no-sandbox','--disable-gpu'],{
  cwd:root,windowsHide:true,encoding:'utf8',timeout:60000,
  env:{...process.env,SCORESPROUT_TEST_DATA:data,SCORESPROUT_SMOKE_STAGE:'layout',SCORESPROUT_TEST_EXPORT:path.join(runRoot,'exports')}
});
const report=path.join(data,'smoke-layout.json');
if(result.error||result.status!==0||!fs.existsSync(report))throw Error(result.error?.message||result.stderr||result.stdout);
console.log(fs.readFileSync(report,'utf8'));console.log(`排版截图：${path.join(data,'smoke-layout.png')}`);
