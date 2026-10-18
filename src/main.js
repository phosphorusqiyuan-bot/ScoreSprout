const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { analyzeMidi, generateVersion, versionToMidi, INSTRUMENTS, DIFFICULTIES } = require('./midi');
const { versionToMusicXML } = require('./musicxml');
const midiSourceUrls = new Set(['https://www.midishow.com/', 'https://bitmidi.com/', 'https://freemidi.org/', 'https://www.vgmusic.com/']);

let libraryRoot;
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
  return { manifest, source };
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
  ipcMain.handle('get-source', wrap(id => { const {source} = ensureSource(id); return {id,...summary(source)}; }));
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
  ipcMain.handle('generate-version', wrap((id,trackId,instrument,difficulty,title,manual) => {
    const {manifest,source} = ensureSource(id);
    const version = generateVersion(source,trackId,instrument,difficulty,title,manual);
    manifest.title = version.title;
    const variantId = `${instrument}-${difficulty}-${crypto.createHash('sha256').update(`${trackId}|${instrument}|${difficulty}`).digest('hex').slice(0,12)}`;
    const dir = path.join(songDir(id),'variants'); fs.mkdirSync(dir,{recursive:true});
    writeJSON(path.join(dir,`${variantId}.json`),version);
    fs.writeFileSync(path.join(dir,`${variantId}.musicxml`),versionToMusicXML(version),'utf8');
    fs.writeFileSync(path.join(dir,`${variantId}.mid`),versionToMidi(version));
    const entry = { id:variantId, songId:id, title:version.title, instrument, difficulty, trackId,
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
    if (!/^(?:[a-f0-9]{16}|(?:piano|guitar|bass|drums)-(?:beginner|intermediate|full)-[a-f0-9]{12})$/.test(variantId) || !m.variants.some(v=>v.id===variantId)) throw new Error('版本不存在。');
    const dir=path.join(songDir(songId),'variants');
    return { entry:m.variants.find(v=>v.id===variantId),version:JSON.parse(fs.readFileSync(path.join(dir,`${variantId}.json`),'utf8')),
      musicxml:fs.readFileSync(path.join(dir,`${variantId}.musicxml`),'utf8') };
  }));
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
