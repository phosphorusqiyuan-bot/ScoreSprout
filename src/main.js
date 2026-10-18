const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { analyzeMidi, generateVersion, versionToMidi, INSTRUMENTS, DIFFICULTIES } = require('./midi');
const { versionToMusicXML } = require('./musicxml');
const { deleteVersion } = require('./library');
const { transcribedNotesToMidi } = require('./audio-import');
const midiSourceUrls = new Set(['https://www.midishow.com/', 'https://bitmidi.com/', 'https://freemidi.org/', 'https://www.vgmusic.com/']);
const TRANSCRIPTION_REVISION='spectral-v2';

let libraryRoot;
let pendingAudio=null;
if (process.env.SCORESPROUT_TEST_DATA) {
  fs.mkdirSync(process.env.SCORESPROUT_TEST_DATA,{recursive:true});
  app.setPath('userData',path.resolve(process.env.SCORESPROUT_TEST_DATA));
}
const safeId = id => { if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('音乐库项目标识无效。'); return id; };
const songDir = id => path.join(libraryRoot, safeId(id));
const manifestPath = id => path.join(songDir(id), 'manifest.json');
const readManifest = id => JSON.parse(fs.readFileSync(manifestPath(id), 'utf8'));
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }
function summary(source) { return { ...source, tracks: source.tracks.map(({notes,...t}) => ({ ...t, noteCount: notes.length })) }; }
function ensureSource(id) {
  const manifest = readManifest(id);
  const source = analyzeMidi(fs.readFileSync(path.join(songDir(id), 'original.mid')), manifest.filename);
  source.title = manifest.title;
  if(manifest.sourceType==='mp3'){
    source.inputType='mp3';
    source.warnings.unshift('MP3 转写只估计音高与节奏，不能识别原曲中的乐器或分离鼓声。请试听并手动指定乐器。速度暂按 120 BPM 记谱。');
  }
  return { manifest, source };
}
function prepareAudio(bytes,filename,title) {
  // A new revision creates a separate source, so arrangements made from an older
  // transcription remain available when the same MP3 is processed again.
  const id=crypto.createHash('sha256').update(bytes).update(TRANSCRIPTION_REVISION).digest('hex').slice(0,24);
  if(fs.existsSync(manifestPath(id))){
    const {manifest,source}=ensureSource(id);
    if(manifest.sourceType==='mp3')return {existing:true,source:{id,...summary(source)}};
  }
  const token=crypto.randomUUID();
  pendingAudio={token,id,filename,bytes,title};
  return {token,filename,bytes:Uint8Array.from(bytes)};
}
function wrap(handler) { return async (_event,...args) => { try { return { ok:true, data:await handler(...args) }; } catch (e) { return { ok:false, error:e.message || String(e) }; } }; }

app.whenReady().then(() => {
  libraryRoot = path.join(app.getPath('userData'), 'library');
  fs.mkdirSync(libraryRoot, { recursive:true });
  ipcMain.handle('import-midi', wrap(async () => {
    const picked = process.env.SCORESPROUT_TEST_IMPORT ? {canceled:false,filePaths:[process.env.SCORESPROUT_TEST_IMPORT]} :
      await dialog.showOpenDialog({ title:'导入 MIDI', properties:['openFile'], filters:[{name:'MIDI 文件',extensions:['mid','midi']}] });
    if (picked.canceled || !picked.filePaths[0]) return null;
    const file = picked.filePaths[0], bytes = fs.readFileSync(file);
    const source = analyzeMidi(bytes, path.basename(file));
    const id = crypto.createHash('sha256').update(bytes).digest('hex').slice(0,24), dir = songDir(id);
    fs.mkdirSync(dir,{recursive:true});
    const old = fs.existsSync(manifestPath(id)) ? readManifest(id) : null;
    fs.writeFileSync(path.join(dir,'original.mid'),bytes);
    const manifest = old || { id, title:source.title, filename:path.basename(file), createdAt:new Date().toISOString(), variants:[] };
    writeJSON(manifestPath(id),manifest);
    return { id, ...summary({ ...source, title:manifest.title }) };
  }));
  ipcMain.handle('select-audio', wrap(async () => {
    pendingAudio=null;
    const picked=process.env.SCORESPROUT_TEST_IMPORT_MP3 ?
      {canceled:false,filePaths:[process.env.SCORESPROUT_TEST_IMPORT_MP3]} :
      await dialog.showOpenDialog({title:'导入 MP3 并转写音符',properties:['openFile'],filters:[{name:'MP3 音频',extensions:['mp3']}]});
    if(picked.canceled||!picked.filePaths[0])return null;
    const file=picked.filePaths[0];
    if(path.extname(file).toLowerCase()!=='.mp3')throw new Error('请选择 .mp3 文件。');
    const size=fs.statSync(file).size;
    if(size>25*1024*1024)throw new Error('MP3 超过 25 MB，请先压缩或裁剪。');
    if(size<100)throw new Error('MP3 文件为空或已损坏。');
    const bytes=fs.readFileSync(file);
    return prepareAudio(bytes,path.basename(file));
  }));
  ipcMain.handle('retranscribe-audio',wrap(id=>{
    pendingAudio=null;
    const manifest=readManifest(id);
    if(manifest.sourceType!=='mp3')throw new Error('只有 MP3 导入的曲目可以重新转写。');
    const file=path.join(songDir(id),'original.mp3');
    if(!fs.existsSync(file))throw new Error('找不到保存的原始 MP3，请重新导入文件。');
    return prepareAudio(fs.readFileSync(file),manifest.audioFilename||`${manifest.title}.mp3`,manifest.title);
  }));
  ipcMain.handle('save-transcription', wrap((token,notes) => {
    if(!pendingAudio||pendingAudio.token!==token)throw new Error('MP3 导入已过期，请重新选择文件。');
    const {id,filename,bytes,title}=pendingAudio;
    const midi=transcribedNotesToMidi(notes);
    const source=analyzeMidi(midi,`${path.parse(filename).name}.mid`);
    if(!source.tracks.length)throw new Error('转写结果没有可用音符。');
    const dir=songDir(id);
    fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'original.mp3'),bytes);
    fs.writeFileSync(path.join(dir,'original.mid'),midi);
    const manifest={id,title:title||path.parse(filename).name||'未命名音频',
      filename:`${path.parse(filename).name}.mid`,audioFilename:filename,sourceType:'mp3',
      transcriptionRevision:TRANSCRIPTION_REVISION,
      createdAt:new Date().toISOString(),variants:[]};
    writeJSON(manifestPath(id),manifest);
    pendingAudio=null;
    source.title=manifest.title;source.inputType='mp3';
    source.warnings.unshift('MP3 转写只估计音高与节奏，不能识别原曲中的乐器或分离鼓声。请试听并手动指定乐器。速度暂按 120 BPM 记谱。');
    return {id,...summary(source)};
  }));
  ipcMain.handle('get-source', wrap(id => { const {source} = ensureSource(id); return {id,...summary(source)}; }));
  ipcMain.handle('export-source-midi', wrap(async id => {
    const {manifest}=ensureSource(id);
    if(manifest.sourceType!=='mp3')throw new Error('只有 MP3 转写结果可在这里直接导出。');
    const defaultPath=`${manifest.title} - 音频转写.mid`.replace(/[\\/:*?"<>|]/g,'_');
    const chosen=process.env.SCORESPROUT_TEST_EXPORT ?
      {canceled:false,filePath:path.join(process.env.SCORESPROUT_TEST_EXPORT,defaultPath)} :
      await dialog.showSaveDialog({title:'导出转写 MIDI',defaultPath,filters:[{name:'MIDI',extensions:['mid']}]});
    if(chosen.canceled||!chosen.filePath)return null;
    if(process.env.SCORESPROUT_TEST_EXPORT)fs.mkdirSync(process.env.SCORESPROUT_TEST_EXPORT,{recursive:true});
    fs.copyFileSync(path.join(songDir(id),'original.mid'),chosen.filePath);
    return chosen.filePath;
  }));
  ipcMain.handle('rename-song', wrap((id,title) => {
    const m = readManifest(id), nextTitle=String(title || '').trim().slice(0,120) || m.title;
    if(nextTitle===m.title) return m.title;
    m.title=nextTitle;
    const dir=path.join(songDir(id),'variants');
    for(const item of m.variants){
      const file=path.join(dir,`${item.id}.json`);
      if(!fs.existsSync(file))continue;
      const version=JSON.parse(fs.readFileSync(file,'utf8'));version.title=m.title;item.title=m.title;
      writeJSON(file,version);
      fs.writeFileSync(path.join(dir,`${item.id}.musicxml`),versionToMusicXML(version),'utf8');
      fs.writeFileSync(path.join(dir,`${item.id}.mid`),versionToMidi(version));
    }
    writeJSON(manifestPath(id),m); return m.title;
  }));
  ipcMain.handle('preview-track', wrap((id,trackId) => {
    const {source} = ensureSource(id), track = source.tracks.find(t=>t.id===trackId);
    if (!track) throw new Error('轨道不存在。');
    return { bpm:source.bpm, instrument:track.detected, notes:track.notes.map(n=>({ ...n,start:n.start*480/source.sourcePpq,duration:n.duration*480/source.sourcePpq })).slice(0,1500) };
  }));
  ipcMain.handle('generate-version', wrap((id,trackIds,choice,difficultyOrTitle,titleOrAssignments,manual) => {
    const {manifest,source} = ensureSource(id);
    const multiple = Array.isArray(trackIds);
    const instrument = multiple ? 'auto' : choice;
    const difficulty = multiple ? choice : difficultyOrTitle;
    const title = multiple ? difficultyOrTitle : titleOrAssignments;
    const assignments = multiple ? titleOrAssignments || {} : manual;
    const version = generateVersion(source,trackIds,instrument,difficulty,title,assignments);
    manifest.title = version.title;
    const key = version.trackIds.length === 1 ? `${version.trackId}|${version.instrument}|${difficulty}` :
      `${version.trackIds.slice().sort().join('|')}|${Object.entries(version.assignments).sort().map(([id,value])=>`${id}:${value}`).join('|')}|${difficulty}`;
    const variantId = `${version.instrument}-${difficulty}-${crypto.createHash('sha256').update(key).digest('hex').slice(0,12)}`;
    const dir = path.join(songDir(id),'variants'); fs.mkdirSync(dir,{recursive:true});
    writeJSON(path.join(dir,`${variantId}.json`),version);
    fs.writeFileSync(path.join(dir,`${variantId}.musicxml`),versionToMusicXML(version),'utf8');
    fs.writeFileSync(path.join(dir,`${variantId}.mid`),versionToMidi(version));
    const entry = { id:variantId, songId:id, title:version.title, instrument:version.instrument, difficulty,
      trackId:version.trackId,trackIds:version.trackIds,assignments:version.assignments,
      trackName:version.trackName, noteCount:version.notes.length, generatedAt:new Date().toISOString() };
    manifest.variants = manifest.variants.filter(v=>v.id!==variantId).concat(entry);
    writeJSON(manifestPath(id),manifest);
    return { ...entry, version, musicxml:fs.readFileSync(path.join(dir,`${variantId}.musicxml`),'utf8') };
  }));
  ipcMain.handle('list-library', wrap(() => {
    const items=[];
    for (const item of fs.readdirSync(libraryRoot,{withFileTypes:true})) {
      if (!item.isDirectory() || !/^[a-f0-9]{24}$/.test(item.name)) continue;
      try { const m=readManifest(item.name); for (const v of m.variants) items.push({ ...v,title:m.title }); }
      catch { /* damaged entry does not hide the rest of the library */ }
    }
    return items.sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt));
  }));
  ipcMain.handle('load-version', wrap((songId,variantId) => {
    const m=readManifest(songId);
    if (!/^(?:[a-f0-9]{16}|(?:piano|guitar|bass|drums|ensemble)-(?:beginner|intermediate|full)-[a-f0-9]{12})$/.test(variantId) || !m.variants.some(v=>v.id===variantId)) throw new Error('版本不存在。');
    const dir=path.join(songDir(songId),'variants');
    return { entry:m.variants.find(v=>v.id===variantId),version:JSON.parse(fs.readFileSync(path.join(dir,`${variantId}.json`),'utf8')),
      musicxml:fs.readFileSync(path.join(dir,`${variantId}.musicxml`),'utf8') };
  }));
  ipcMain.handle('delete-version', wrap((songId,variantId) => deleteVersion(libraryRoot,songId,variantId)));
  ipcMain.handle('export-version', wrap(async (songId,variantId,format) => {
    const m=readManifest(songId), v=m.variants.find(v=>v.id===variantId);
    if (!v) throw new Error('版本不存在。');
    if (!['mid','musicxml'].includes(format)) throw new Error('不支持的导出格式。');
    const ext=format==='mid'?'mid':'musicxml';
    const defaultPath=`${m.title} - ${INSTRUMENTS[v.instrument]} - ${DIFFICULTIES[v.difficulty]}.${ext}`.replace(/[\\/:*?"<>|]/g,'_');
    const chosen=process.env.SCORESPROUT_TEST_EXPORT ? {canceled:false,filePath:path.join(process.env.SCORESPROUT_TEST_EXPORT,defaultPath)} :
      await dialog.showSaveDialog({title:'导出文件',defaultPath,filters:[{name:format==='mid'?'MIDI':'MusicXML',extensions:[ext]}]});
    if (chosen.canceled || !chosen.filePath) return null;
    if (process.env.SCORESPROUT_TEST_EXPORT) fs.mkdirSync(process.env.SCORESPROUT_TEST_EXPORT,{recursive:true});
    fs.copyFileSync(path.join(songDir(songId),'variants',`${variantId}.${ext}`),chosen.filePath);
    return chosen.filePath;
  }));

  const win=new BrowserWindow({width:1450,height:930,minWidth:1050,minHeight:700,show:!process.env.SCORESPROUT_SMOKE_STAGE,backgroundColor:'#f7f7f2',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true} });
  win.webContents.setWindowOpenHandler(({url}) => {
    if (midiSourceUrls.has(url)) shell.openExternal(url);
    return { action:'deny' };
  });
  win.webContents.on('will-navigate',event => event.preventDefault());
  win.loadFile(path.join(__dirname,'index.html'));
  if (process.env.SCORESPROUT_SMOKE_STAGE) win.webContents.once('did-finish-load',async()=>{
    try {
      const stage=process.env.SCORESPROUT_SMOKE_STAGE;
      const script=fs.readFileSync(path.join(__dirname,'..','test',`smoke-${stage}.renderer.txt`),'utf8');
      const result=await win.webContents.executeJavaScript(script,true);
      const out=path.join(process.env.SCORESPROUT_TEST_DATA,`smoke-${stage}.json`);writeJSON(out,result);
      if(stage==='reload') { await win.webContents.executeJavaScript("document.body.innerHTML=document.querySelector('#score svg').outerHTML;document.body.style.background='white'",true); win.showInactive(); await new Promise(resolve=>setTimeout(resolve,500)); fs.writeFileSync(path.join(process.env.SCORESPROUT_TEST_DATA,'smoke-reload.png'),(await win.webContents.capturePage()).toPNG()); }
      console.log(JSON.stringify(result));app.exit(0);
    } catch(e){console.error('SMOKE FAILURE',e);app.exit(1);}
  });
});
app.on('window-all-closed',()=>app.quit());
