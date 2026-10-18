const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const root=path.join(__dirname,'..');
const runtime=path.join(root,'.sheetsage2-runtime');
const python=path.join(runtime,'venv','Scripts','python.exe');
const bridge=path.join(root,'scripts','sheetsage2_bridge.py');

function checkRuntime(){
  if(!fs.existsSync(python))throw new Error('尚未安装 SheetSage2。请先双击「安装 SheetSage2.cmd」完成一次性安装（需要联网，建议预留 15 GB 空间）。');
  if(!fs.existsSync(path.join(runtime,'ready')))throw new Error('SheetSage2 安装尚未完成。请重新运行「安装 SheetSage2.cmd」。');
}

async function transcribeWithSheetSage(samples,onProgress=()=>{},options={}){
  if(!(samples instanceof Float32Array)||!samples.length||samples.length>22050*600)
    throw new Error('音频数据无效或超过 10 分钟。');
  checkRuntime();
  const tempRoot=fs.realpathSync(os.tmpdir());
  const temp=fs.mkdtempSync(path.join(tempRoot,'scoresprout-sheetsage2-'));
  const pcm=path.join(temp,'audio.f32');
  // Buffer.from(view) copies the renderer's PCM so it can be safely transferred.
  fs.writeFileSync(pcm,Buffer.from(samples.buffer,samples.byteOffset,samples.byteLength));
  try{
    const result=await new Promise((resolve,reject)=>{
      const process=spawn(python,[bridge,pcm,'22050',temp],{
        cwd:root,windowsHide:true,
        env:{...globalThis.process.env,HF_HOME:path.join(runtime,'hf-cache'),HF_HUB_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1',PYTHONIOENCODING:'utf-8'},
      });
      options.children?.add(process);
      let stdout='',stderr='',reportedError='';
      process.stdout.setEncoding('utf8');process.stderr.setEncoding('utf8');
      process.stdout.on('data',chunk=>{
        stdout+=chunk;
        let end;
        while((end=stdout.indexOf('\n'))>=0){
          const line=stdout.slice(0,end).trim();stdout=stdout.slice(end+1);
          if(!line.startsWith('SCORESPROUT:'))continue;
          try{
            const event=JSON.parse(line.slice('SCORESPROUT:'.length));
            if(event.stage==='error')reportedError=event.message;
            else onProgress(event);
          }catch{/* ignore a partial/non-protocol diagnostic line */}
        }
      });
      process.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-10000);});
      process.once('error',reject);
      process.once('exit',code=>{
        options.children?.delete(process);
        if(code!==0){
          const detail=reportedError||stderr.trim().split('\n').at(-1)||`进程异常退出（${code}）。`;
          const friendly=/out of memory|cuda error.*memory/i.test(detail) ?
            '显卡显存不足。请关闭占用显卡的程序后重试，或用 CPU 模式运行（会更慢）。' :
            /disk cache|cached files|local_files_only|model files/i.test(detail) ?
              '模型文件缺失或安装不完整。请重新双击「安装 SheetSage2.cmd」。' :
              `SheetSage2 转写失败：${detail}`;
          reject(new Error(friendly));return;
        }
        try{
          const midi=fs.readFileSync(path.join(temp,'melody.mid'));
          const metadata=JSON.parse(fs.readFileSync(path.join(temp,'result.json'),'utf8'));
          const analysis=JSON.parse(fs.readFileSync(path.join(temp,'analysis.json'),'utf8'));
          resolve({midi,metadata,analysis});
        }catch(error){reject(new Error(`SheetSage2 没有生成有效 MIDI：${error.message}`));}
      });
    });
    return result;
  }finally{
    if(path.dirname(fs.realpathSync(temp))===tempRoot&&path.basename(temp).startsWith('scoresprout-sheetsage2-'))
      fs.rmSync(temp,{recursive:true,force:true});
  }
}

module.exports={transcribeWithSheetSage,checkRuntime};
