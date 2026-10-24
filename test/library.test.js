const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {deleteVersion,deleteSource}=require('../src/library');

const songId='a'.repeat(24);
const first='piano-full-0123456789ab', second='guitar-beginner-abcdef123456';
function fixture(t) {
  const root=path.resolve(__dirname,'..');
  const library=fs.mkdtempSync(path.join(root,'.smoke-delete-unit-'));
  t.after(()=>{
    const target=path.resolve(library);
    if(!target.startsWith(root+path.sep)||!path.basename(target).startsWith('.smoke-delete-unit-'))
      throw Error('Unexpected cleanup directory');
    fs.rmSync(target,{recursive:true,force:true});
  });
  const song=path.join(library,songId), variants=path.join(song,'variants');
  fs.mkdirSync(variants,{recursive:true});
  fs.writeFileSync(path.join(song,'original.mid'),'original MIDI');
  fs.writeFileSync(path.join(song,'manifest.json'),JSON.stringify({id:songId,title:'测试歌曲',variants:[{id:first},{id:second}]}));
  for(const id of [first,second])for(const ext of ['json','mid','musicxml'])fs.writeFileSync(path.join(variants,`${id}.${ext}`),id);
  return {library,song,variants,manifest:()=>JSON.parse(fs.readFileSync(path.join(song,'manifest.json'),'utf8'))};
}
test('删除只移除选定版本，保留原始 MIDI 与其他版本',t=>{
  const f=fixture(t);
  assert.equal(deleteVersion(f.library,songId,first).deleted,true);
  assert.deepEqual(f.manifest().variants,[{id:second}]);
  assert.deepEqual(fs.readdirSync(f.variants).sort(),['json','mid','musicxml'].map(ext=>`${second}.${ext}`).sort());
  assert.equal(fs.readFileSync(path.join(f.song,'original.mid'),'utf8'),'original MIDI');
  deleteVersion(f.library,songId,second);
  assert.equal(f.manifest().variants.length,0);
  assert(fs.existsSync(path.join(f.song,'original.mid')));
});
test('缺少部分生成文件的乐谱仍可删除',t=>{
  const f=fixture(t);fs.unlinkSync(path.join(f.variants,`${first}.mid`));
  assert.equal(deleteVersion(f.library,songId,first).deleted,true);
  assert.equal(f.manifest().variants.length,1);
});
test('拒绝越界路径和不存在的版本',t=>{
  const f=fixture(t);
  assert.throws(()=>deleteVersion(f.library,'../outside',first),/标识无效/);
  assert.throws(()=>deleteVersion(f.library,songId,'../../original'),/标识无效/);
  assert.throws(()=>deleteVersion(f.library,songId,'bass-full-999999999999'),/不存在/);
  assert.equal(f.manifest().variants.length,2);
});
test('音乐库写入失败时恢复原有乐谱文件',t=>{
  const f=fixture(t), originalWrite=fs.writeFileSync;
  const mocked=t.mock.method(fs,'writeFileSync',(file,...args)=>{
    if(path.basename(file).startsWith('manifest-delete-'))throw Error('disk write failed');
    return originalWrite(file,...args);
  });
  assert.throws(()=>deleteVersion(f.library,songId,first),/乐谱已保留/);
  mocked.mock.restore();
  assert.equal(f.manifest().variants.length,2);
  for(const ext of ['json','mid','musicxml'])assert(fs.existsSync(path.join(f.variants,`${first}.${ext}`)));
  assert(!fs.readdirSync(f.variants).some(name=>name.includes('.deleting-')));
});

test('删除未生成乐谱的源文件，移除音乐库副本但保留外部原文件与其他歌曲',t=>{
  const f=fixture(t),pending='b'.repeat(24),dir=path.join(f.library,pending);
  fs.mkdirSync(dir);fs.mkdirSync(path.join(dir,'variants'));
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({variants:[],sourceType:'mp3'}));
  for(const name of ['original.mid','original.mp3'])fs.writeFileSync(path.join(dir,name),'library copy');
  const external=path.join(f.library,'external-original.mp3');fs.writeFileSync(external,'external file');
  assert.deepEqual(deleteSource(f.library,pending),{deleted:true,warning:''});
  assert(!fs.existsSync(dir));assert.equal(fs.readFileSync(external,'utf8'),'external file');
  assert.equal(f.manifest().variants.length,2);assert(fs.existsSync(path.join(f.song,'original.mid')));
  assert(!fs.readdirSync(f.library).some(name=>name.startsWith('.deleted-source-')));
});

test('拒绝删除已有乐谱、越界路径和丢失的源文件',t=>{
  const f=fixture(t);
  assert.throws(()=>deleteSource(f.library,songId),/已有乐谱/);
  assert.throws(()=>deleteSource(f.library,'../outside'),/标识无效/);
  assert.throws(()=>deleteSource(f.library,'f'.repeat(24)),/不存在/);
  assert.equal(f.manifest().variants.length,2);
});

test('空版本清单下仍有乐谱文件时保留歌曲，防止误删未登记的乐谱',t=>{
  const f=fixture(t);
  fs.writeFileSync(path.join(f.song,'manifest.json'),JSON.stringify({variants:[]}));
  assert.throws(()=>deleteSource(f.library,songId),/关联的乐谱文件/);
  assert(fs.existsSync(path.join(f.variants,first+'.musicxml')));
});

test('拒绝递归删除链接到其他位置的源文件目录',t=>{
  const f=fixture(t),linkId='b'.repeat(24),link=path.join(f.library,linkId);
  fs.symlinkSync(f.song,link,process.platform==='win32'?'junction':'dir');
  try {
    assert.throws(()=>deleteSource(f.library,linkId),/目录异常/);
    assert(fs.existsSync(path.join(f.song,'original.mid')));
  } finally {fs.unlinkSync(link);}
});
