const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { analyzeMidi, generateVersion, versionToMidi, INSTRUMENTS, DIFFICULTIES } = require('./midi');
const { versionToMusicXML } = require('./musicxml');
const { deleteVersion } = require('./library');
const { transcribeWithSheetSage } = require('./sheetsage2');
const { transcribedNotesToMidi } = require('./audio-import');
const { enhancePianoVersion, renameMusicXML } = require('./piano');
const midiSourceUrls = new Set(['https://www.midishow.com/', 'https://bitmidi.com/', 'https://freemidi.org/', 'https://www.vgmusic.com/']);
const TRANSCRIPTION_REVISION='sheetsage2-arrangements-v1';

let libraryRoot;
let pendingAudio=null;
const transcriptionWorkers=new Set();
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
function markMp3Source(source) {
  source.inputType='mp3';
  for(const track of source.tracks){
    track.detected='piano';
    const vocal=/vocal/i.test(track.name);
    track.name=vocal?'人声旋律':/\bins\b|instrumental/i.test(track.name)?'器乐旋律':track.name;
    track.instrumentName='转写旋律（钢琴试听）';
  }
  source.warnings.unshift('SheetSage2 分别提取人声、器乐旋律及和弦、节拍。吉他、贝斯、鼓由这些结果改编，不是原曲乐器分轨。');
  return source;
}
function ensureSource(id) {
  const manifest = readManifest(id);
  const source = analyzeMidi(fs.readFileSync(path.join(songDir(id), 'original.mid')), manifest.filename);
  source.title = manifest.title;
  if(manifest.sourceType==='mp3'){
    source.audioAnalysis=manifest.audioAnalysis||{};
    markMp3Source(source);
  }
  return { manifest, source };
}
function prepareAudio(bytes,filename) {
  // Include the algorithm revision so an older import does not masquerade as
  // the current transcription when the same MP3 is selected again.
  const id=crypto.createHash('sha256').update(bytes).update(TRANSCRIPTION_REVISION).digest('hex').slice(0,24);
  if(fs.existsSync(manifestPath(id))){
    const {manifest,source}=ensureSource(id);
    if(manifest.sourceType==='mp3')return {existing:true,source:{id,...summary(source)}};
  }
  const token=crypto.randomUUID();
  pendingAudio={token,id,filename,bytes};
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
  ipcMain.handle('transcribe-audio', async (event,token,samples) => {
    try {
    if(!pendingAudio||pendingAudio.token!==token)throw new Error('MP3 导入已过期，请重新选择文件。');
    if(!(samples instanceof Float32Array)||!samples.length||samples.length>22050*600)
      throw new Error('音频数据无效或超过 10 分钟。');
    // The 440 Hz Electron smoke fixture exercises UI, storage and export. A
    // musical recording must be used separately to evaluate the actual model.
    const mock=process.env.SCORESPROUT_SMOKE_STAGE==='mp3' ? {
      midi:transcribedNotesToMidi([{pitch:69,start:0,duration:2.7,velocity:90}]),
      metadata:{vocalNotes:0,instrumentalNotes:1,noteCount:1,device:'fixture'}
    } : null;
    const {midi,metadata,analysis}=mock||await transcribeWithSheetSage(samples,progress=>{
      if(!event.sender.isDestroyed())event.sender.send('transcription-progress',{token,progress});
    },{children:transcriptionWorkers});
    // A later import invalidates this pending result instead of silently saving
    // the transcription under the wrong audio's token.
    if(!pendingAudio||pendingAudio.token!==token)throw new Error('MP3 导入已更改，请重新选择文件。');
    pendingAudio.transcribedMidi=midi;
    pendingAudio.transcriptionStats=metadata;
    pendingAudio.audioAnalysis=analysis||{};
    return {ok:true,data:metadata};
    } catch(error) {return {ok:false,error:error.message||String(error)};}
  });
  ipcMain.handle('save-transcription', wrap(token => {
    if(!pendingAudio||pendingAudio.token!==token)throw new Error('MP3 导入已过期，请重新选择文件。');
    const {id,filename,bytes}=pendingAudio;
    const midi=pendingAudio.transcribedMidi;
    if(!midi)throw new Error('SheetSage2 尚未生成 MIDI。');
    const source=analyzeMidi(midi,`${path.parse(filename).name}.mid`);
    if(!source.tracks.length)throw new Error('转写结果没有可用音符。');
    const dir=songDir(id);
    fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'original.mp3'),bytes);
    fs.writeFileSync(path.join(dir,'original.mid'),midi);
    const manifest={id,title:path.parse(filename).name||'未命名音频',
      filename:`${path.parse(filename).name}.mid`,audioFilename:filename,sourceType:'mp3',
      transcriptionRevision:TRANSCRIPTION_REVISION,
      transcriptionStats:pendingAudio.transcriptionStats,
      audioAnalysis:pendingAudio.audioAnalysis,
      createdAt:new Date().toISOString(),variants:[]};
    writeJSON(manifestPath(id),manifest);
    pendingAudio=null;
    source.title=manifest.title;source.audioAnalysis=manifest.audioAnalysis;markMp3Source(source);
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
      const xmlPath=path.join(dir,`${item.id}.musicxml`);
      const previousXml=fs.existsSync(xmlPath)?fs.readFileSync(xmlPath,'utf8'):versionToMusicXML(version);
      fs.writeFileSync(xmlPath,renameMusicXML(previousXml,version),'utf8');
      fs.writeFileSync(path.join(dir,`${item.id}.mid`),versionToMidi(version));
    }
    writeJSON(manifestPath(id),m); return m.title;
  }));
  ipcMain.handle('preview-track', wrap((id,trackId) => {
    const {source} = ensureSource(id), track = source.tracks.find(t=>t.id===trackId);
    if (!track) throw new Error('轨道不存在。');
    return { bpm:source.bpm, instrument:track.detected, notes:track.notes.map(n=>({ ...n,start:n.start*480/source.sourcePpq,duration:n.duration*480/source.sourcePpq })).slice(0,1500) };
  }));
  ipcMain.handle('generate-version', wrap(async (id,trackIds,choice,difficultyOrTitle,titleOrAssignments,manual) => {
    const {manifest,source} = ensureSource(id);
    const multiple = Array.isArray(trackIds);
    const instrument = multiple ? (source.inputType==='mp3' ? manual||'piano' : 'auto') : choice;
    const difficulty = multiple ? choice : difficultyOrTitle;
    const title = multiple ? difficultyOrTitle : titleOrAssignments;
    const assignments = multiple ? titleOrAssignments || {} : manual;
    const version = generateVersion(source,trackIds,instrument,difficulty,title,assignments);
    const {musicxml} = await enhancePianoVersion(version,source.inputType);
    manifest.title = version.title;
    const key = version.trackIds.length === 1 ? `${version.trackId}|${version.instrument}|${difficulty}` :
      `${version.instrument}|${version.trackIds.slice().sort().join('|')}|${Object.entries(version.assignments).sort().map(([id,value])=>`${id}:${value}`).join('|')}|${difficulty}`;
    const variantId = `${version.instrument}-${difficulty}-${crypto.createHash('sha256').update(key).digest('hex').slice(0,12)}`;
    const dir = path.join(songDir(id),'variants'); fs.mkdirSync(dir,{recursive:true});
    writeJSON(path.join(dir,`${variantId}.json`),version);
    fs.writeFileSync(path.join(dir,`${variantId}.musicxml`),musicxml,'utf8');
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
app.on('window-all-closed',()=>{
  for(const worker of transcriptionWorkers)worker.kill();
  app.quit();
});
