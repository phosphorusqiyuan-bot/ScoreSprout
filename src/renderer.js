const $ = id => document.getElementById(id);
const names={piano:'钢琴',guitar:'吉他',drums:'鼓',bass:'贝斯'};
const levels={beginner:'新手版',intermediate:'进阶版',full:'完整版'};
const state={source:null,trackId:null,difficulty:'beginner',entry:null,library:[]};
const formatTime=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const player=new ScorePlayer((now,total)=>{ $('currentTime').textContent=formatTime(now);$('totalTime').textContent=formatTime(total);$('seek').value=total ? Math.round(now/total*1000) : 0; },()=>{ $('playBtn').textContent='▶';$('previewBtn').textContent='▶ 试听轨道'; });
const previewPlayer=new ScorePlayer(()=>{},()=>{ $('previewBtn').textContent='▶ 试听轨道'; });
function notice(message,type='') { const el=$('notice');el.textContent=message;el.className=`notice ${type}`; if (!message) el.classList.add('hidden'); }
async function guarded(fn) { try { await fn(); } catch(e) { notice(e.message||String(e),'error'); } }
function selectTrack(id) {
  state.trackId=id;
  const track=state.source?.tracks.find(t=>t.id===id); if (!track) return;
  if (track.detected!=='unknown') { $('instrument').value=track.detected;$('manualAssign').checked=false;$('manualAssign').disabled=true; }
  else { $('manualAssign').checked=false;$('manualAssign').disabled=false; }
  document.querySelectorAll('.track-item').forEach(el=>el.classList.toggle('selected',el.dataset.id===id));
  document.querySelectorAll('.track-item input').forEach(el=>el.checked=el.value===id);
}
function renderTracks() {
  const box=$('trackList');box.replaceChildren();
  if (!state.source.tracks.length) { box.textContent='没有可用音符轨道。';return; }
  for (const t of state.source.tracks) {
    const label=document.createElement('label');label.className='track-item';label.dataset.id=t.id;
    const radio=document.createElement('input');radio.type='radio';radio.name='track';radio.value=t.id;
    const body=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small'),pill=document.createElement('span');
    title.textContent=t.name;meta.textContent=`轨道 ${t.sourceTrack} · 通道 ${t.channel+1} · ${t.instrumentName} · ${t.noteCount} 个音符`;
    pill.className=`pill ${t.detected==='unknown'?'unknown':''}`;pill.textContent=names[t.detected]||'未识别';
    body.append(title,meta);label.append(radio,body,pill);label.addEventListener('click',()=>selectTrack(t.id));box.append(label);
  }
  selectTrack(state.trackId && state.source.tracks.some(t=>t.id===state.trackId)?state.trackId:state.source.tracks[0].id);
}
function showSource(source) {
  player.stop();previewPlayer.stop();state.source=source;state.entry=null;state.trackId=null;
  $('emptyState').classList.add('hidden');$('workspace').classList.remove('hidden');$('result').classList.add('hidden');
  $('songTitle').value=source.title;$('pageTitle').textContent=source.title;$('pageSubtitle').textContent='选择轨道和难度，生成适合自己的乐谱。';
  $('tempoValue').textContent=`${source.bpm} BPM`;$('timeValue').textContent=source.timeSignature.join('/');
  const key=source.keyFifths, namesByFifths=source.keyMode?['A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯','G♯','D♯','A♯']:['C♭','G♭','D♭','A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯'];
  $('keyValue').textContent=source.keyProvided?`${namesByFifths[Math.max(0,Math.min(14,key+7))]} ${source.keyMode?'小调':'大调'}`:'未提供';
  $('trackCount').textContent=String(source.tracks.length);$('sourceMeta').textContent=`${source.tracks.reduce((n,t)=>n+t.noteCount,0)} 个音符`;
  renderTracks();notice(source.warnings.join(' '));
}
async function refreshLibrary() { state.library=await window.scoresprout.listLibrary();renderLibrary(); }
function renderLibrary() {
  const box=$('libraryList');box.replaceChildren();$('libraryCount').textContent=state.library.length;
  const search=$('search').value.trim().toLowerCase(), inst=$('filterInstrument').value, diff=$('filterDifficulty').value;
  const items=state.library.filter(x=>(!search||x.title.toLowerCase().includes(search))&&(!inst||x.instrument===inst)&&(!diff||x.difficulty===diff));
  if (!items.length) { const p=document.createElement('div');p.className='library-empty';p.textContent=state.library.length?'没有符合条件的版本':'还没有保存的乐谱';box.append(p);return; }
  for (const item of items) { const button=document.createElement('button');button.className=`library-item ${state.entry?.id===item.id&&state.entry?.songId===item.songId?'active':''}`;
    const title=document.createElement('strong'),meta=document.createElement('span');title.textContent=`${item.title} · ${levels[item.difficulty]}`;
    meta.textContent=`${names[item.instrument]} · ${item.trackName}`;button.append(title,meta);
    button.addEventListener('click',()=>guarded(()=>openLibrary(item)));box.append(button); }
}
async function renderVersion(data) {
  previewPlayer.stop();$('previewBtn').textContent='▶ 试听轨道';state.entry=data.entry||data;const v=data.version;player.load(v.notes,v.bpm,v.instrument);$('playBtn').textContent='▶';
  $('result').classList.remove('hidden');$('resultTitle').textContent=`${v.title} · ${levels[v.difficulty]}`;
  $('resultDetails').textContent=`${names[v.instrument]} · ${v.trackName} · ${v.notes.length} 个音符`;
  $('playingInstrument').textContent=names[v.instrument];
  const target=$('score');target.replaceChildren();
  if (!window.opensheetmusicdisplay) throw new Error('乐谱渲染组件未加载。请重新安装依赖。');
  const osmd=new opensheetmusicdisplay.OpenSheetMusicDisplay(target,{autoResize:true,backend:'svg',drawTitle:false,drawComposer:false,drawPartNames:false});
  await osmd.load(data.musicxml);osmd.render();
  $('result').scrollIntoView({behavior:'smooth',block:'start'});renderLibrary();
}
async function openLibrary(item) {
  const source=await window.scoresprout.getSource(item.songId);showSource(source);
  state.trackId=item.trackId;selectTrack(item.trackId);$('instrument').value=item.instrument;
  if (source.tracks.find(t=>t.id===item.trackId)?.detected!==item.instrument) $('manualAssign').checked=true;
  state.difficulty=item.difficulty;document.querySelectorAll('.difficulty-option').forEach(b=>b.classList.toggle('active',b.dataset.difficulty===state.difficulty));
  const loaded=await window.scoresprout.loadVersion(item.songId,item.id);await renderVersion(loaded);
}
async function importMidi() { const source=await window.scoresprout.importMidi();if (!source) return;showSource(source);await refreshLibrary(); }
async function generate() {
  if (!state.source) return; if (!state.trackId) throw new Error('请先选择有音符的轨道。');
  const title=$('songTitle').value.trim();if (!title) throw new Error('请填写歌曲名。');
  const track=state.source.tracks.find(t=>t.id===state.trackId),instrument=$('instrument').value;
  if (track.detected!==instrument) {
    if (track.detected!=='unknown') throw new Error(`此轨道已识别为${names[track.detected]}，不能作为${names[instrument]}生成乐谱。`);
    if (!$('manualAssign').checked) throw new Error('此轨道乐器未识别；请先试听并勾选手动指定。');
  }
  $('generateBtn').disabled=true;$('generateBtn').textContent='正在生成…';
  try { const data=await window.scoresprout.generate(state.source.id,state.trackId,instrument,state.difficulty,title,$('manualAssign').checked);
    await window.scoresprout.renameSong(state.source.id,title);state.source.title=title;$('pageTitle').textContent=title;
    await refreshLibrary();await renderVersion(data);notice('乐谱已保存到本地音乐库。','success');
  } finally { $('generateBtn').disabled=false;$('generateBtn').innerHTML='生成乐谱 <span>→</span>'; }
}
async function preview() {
  if (!state.source||!state.trackId) throw new Error('请先选择轨道。');
  if (previewPlayer.playing) {previewPlayer.stop();$('previewBtn').textContent='▶ 试听轨道';return;}
  player.pause();$('playBtn').textContent='▶';const data=await window.scoresprout.previewTrack(state.source.id,state.trackId);previewPlayer.load(data.notes,data.bpm,$('instrument').value);
  await previewPlayer.play();$('previewBtn').textContent='■ 停止试听';notice(`正在试听：${state.source.tracks.find(t=>t.id===state.trackId).name}`,'success');
}
function bind() {
  $('importBtn').addEventListener('click',()=>guarded(importMidi));$('emptyImportBtn').addEventListener('click',()=>guarded(importMidi));
  $('generateBtn').addEventListener('click',()=>guarded(generate));$('previewBtn').addEventListener('click',()=>guarded(preview));
  $('songTitle').addEventListener('change',()=>guarded(async()=>{if(state.source){const name=await window.scoresprout.renameSong(state.source.id,$('songTitle').value);state.source.title=name;$('pageTitle').textContent=name;await refreshLibrary();}}));
  document.querySelectorAll('.difficulty-option').forEach(b=>b.addEventListener('click',()=>{state.difficulty=b.dataset.difficulty;document.querySelectorAll('.difficulty-option').forEach(x=>x.classList.toggle('active',x===b));}));
  for (const id of ['search','filterInstrument','filterDifficulty']) $(id).addEventListener(id==='search'?'input':'change',renderLibrary);
  $('playBtn').addEventListener('click',()=>guarded(async()=>{previewPlayer.stop();$('previewBtn').textContent='▶ 试听轨道';if(player.playing){player.pause();$('playBtn').textContent='▶';}else{await player.play();$('playBtn').textContent='Ⅱ';}}));
  $('stopBtn').addEventListener('click',()=>{player.stop();$('playBtn').textContent='▶';});
  $('seek').addEventListener('input',e=>player.seek(Number(e.target.value)/1000*(player.duration||0)));
  for(const [id,format] of [['exportMidi','mid'],['exportXml','musicxml']]) $(id).addEventListener('click',()=>guarded(async()=>{if(!state.entry) return;const file=await window.scoresprout.exportVersion(state.entry.songId,state.entry.id,format);if(file) notice(`已导出：${file}`,'success');}));
}
bind();guarded(refreshLibrary);
