// Run once when preparing the application. Playback uses only these local files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const target=path.join(__dirname,'..','src','assets','piano');
async function main(){
  fs.mkdirSync(target,{recursive:true});
  const samples=[];
  for(let midi=21;midi<=108;midi+=3){
    const name=['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'][midi%12]+(Math.floor(midi/12)-1);
    samples.push({midi,file:name+'.mp3'});
  }
  let next=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(next<samples.length){
      const sample=samples[next++],file=path.join(target,sample.file);
      if(!fs.existsSync(file)){
        const response=await fetch('https://tonejs.github.io/audio/salamander/'+sample.file,{signal:AbortSignal.timeout(60000)});
        if(!response.ok)throw Error(sample.file+': '+response.status);
        const buffer=Buffer.from(await response.arrayBuffer());
        if(buffer.length<5000)throw Error('Invalid piano sample: '+sample.file);
        fs.writeFileSync(file,buffer);
      }
      const buffer=fs.readFileSync(file);
      sample.bytes=buffer.length;sample.sha256=crypto.createHash('sha256').update(buffer).digest('hex');
    }
  }));
  fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify({name:'Salamander Grand Piano',author:'Alexander Holm',samples},null,2));
  console.log(samples.length+' local piano samples, '+samples.reduce((s,n)=>s+n.bytes,0)+' bytes');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
