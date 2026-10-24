const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),library=process.argv[2]&&path.resolve(process.argv[2]);
if(!library||!fs.statSync(library).isDirectory())throw Error('用法：node scripts/smoke-pdf.js <已有音乐库目录>');
const runRoot=fs.mkdtempSync(path.join(root,'.smoke-pdf-')),data=path.join(runRoot,'data');
fs.mkdirSync(data);fs.cpSync(library,path.join(data,'library'),{recursive:true});
const result=spawnSync(require('electron'),['.','--no-sandbox','--disable-gpu'],{
  cwd:root,windowsHide:true,encoding:'utf8',timeout:75000,
  env:{...process.env,SCORESPROUT_TEST_DATA:data,SCORESPROUT_SMOKE_STAGE:'pdf',SCORESPROUT_TEST_EXPORT:path.join(runRoot,'exports')}
});
const report=path.join(data,'smoke-pdf.json');
if(result.error||result.status!==0||!fs.existsSync(report))throw Error(result.error?.message||result.stderr||result.stdout);
const summary=JSON.parse(fs.readFileSync(report,'utf8'));
if(fs.readFileSync(summary.exported).subarray(0,5).toString()!=='%PDF-')throw Error('导出的文件不是 PDF');
const rendering=JSON.parse(fs.readFileSync(path.join(data,'pdf-render.json'),'utf8'));
if(rendering.titleFits===false)throw Error('PDF 标题超出页面。');
console.log(JSON.stringify({...summary,...JSON.parse(fs.readFileSync(path.join(data,'pdf-render.json'),'utf8'))},null,2));
