const $ = id => document.getElementById(id);
const names = { piano:'钢琴', guitar:'吉他', drums:'鼓', bass:'贝斯', ensemble:'合奏' };
const levels = { beginner:'新手版', intermediate:'进阶版', full:'完整版' };
const instruments = ['piano','guitar','bass','drums'];
const state = { source:null, trackIds:[], assignments:{}, mp3Instrument:'piano', difficulty:'beginner', entry:null, library:[], previewingTrackId:null, pendingDelete:null, deleting:false };
const formatTime = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
let scoreCursor=null,scoreCursorTicks=[],scoreCursorIndex=0,scoreCursorShown=false,scorePpq=480,scoreBpm=120;
function moveScoreCursor(seconds) {
  if(!scoreCursor||!scoreCursorTicks.length)return;
  if(!player.playing&&seconds===0){scoreCursor.hide();scoreCursor.cursorElement.style.display='none';scoreCursorShown=false;return;}
  const tick=seconds*scoreBpm*scorePpq/60;
  let low=0,high=scoreCursorTicks.length;
  while(low<high){const mid=(low+high)>>1;if(scoreCursorTicks[mid]<=tick+.01)low=mid+1;else high=mid;}
  const target=Math.max(0,low-1);
  if(target<scoreCursorIndex){scoreCursor.reset();scoreCursorIndex=0;}
  if(target!==scoreCursorIndex){
    while(scoreCursorIndex<target){scoreCursor.next();scoreCursorIndex++;}
    scoreCursorShown=false;
  }
  if(!scoreCursorShown){
    scoreCursor.show();scoreCursorShown=true;
    // OSMD 1.9.x leaves display:none on its cursor image after show().
    scoreCursor.cursorElement.style.display='block';
    scoreCursor.cursorElement.style.zIndex='10';
    const shell=$('score').parentElement,rect=scoreCursor.cursorElement.getBoundingClientRect();
    const view=shell.getBoundingClientRect();
    if(rect.top<view.top+16||rect.bottom>view.bottom-16)
      shell.scrollTop+=rect.top-view.top-shell.clientHeight/3;
    if(rect.left<view.left+16||rect.right>view.right-16)
      shell.scrollLeft+=rect.left-view.left-shell.clientWidth/3;
  }
}
function attachScoreCursor(osmd,version) {
  const cursor=osmd.cursor;
  cursor.reset();cursor.hide();
  const iterator=cursor.iterator.clone(),ticks=[];
  for(let i=0;i<20000&&!iterator.EndReached;i++){
    const tick=Math.max(0,Math.round(iterator.currentTimeStamp.RealValue*version.ppq*4));
    ticks.push(tick);
    iterator.moveToNextVisibleVoiceEntry(false);
  }
  scoreCursor=cursor;scoreCursorTicks=ticks;scoreCursorIndex=0;scoreCursorShown=false;
  scorePpq=version.ppq;scoreBpm=version.bpm;
}
const player = new ScorePlayer((now,total) => {
  $('currentTime').textContent=formatTime(now);
  $('totalTime').textContent=formatTime(total);
  $('seek').value=total ? Math.round(now/total*1000) : 0;
  moveScoreCursor(now);
}, () => { $('playBtn').textContent='▶'; });
const previewPlayer = new ScorePlayer(() => {}, resetPreviewButtons);
function notice(message,type='') {
  const el=$('notice'); el.textContent=message; el.className=`notice ${type}`;
  if (!message) el.classList.add('hidden');
}
async function guarded(fn) { try { await fn(); } catch(e) { notice(e.message||String(e),'error'); } }
function resetPreviewButtons() {
  state.previewingTrackId=null;
  document.querySelectorAll('.track-preview').forEach(button => {
    button.textContent='▶ 试听';
    button.setAttribute('aria-label',`试听${button.dataset.name}`);
  });
}
function selectedInstrument(track) { return state.source?.inputType==='mp3' ? 'piano' :
  track.detected==='unknown' ? state.assignments[track.id] : track.detected; }
function renderSelection() {
  if (!state.source) return;
  for (const row of document.querySelectorAll('.track-item')) {
    const selected=state.trackIds.includes(row.dataset.id);
    row.classList.toggle('selected',selected);
    row.querySelector('input[type="checkbox"]').checked=selected;
  }
  const selected=state.source.tracks.filter(t=>state.trackIds.includes(t.id));
  const kinds=[...new Set(selected.map(selectedInstrument).filter(Boolean))];
  $('selectionSummary').textContent=state.source.inputType==='mp3' ?
    `已选 ${selected.length} 条旋律 · ${names[state.mp3Instrument]}${['bass','drums'].includes(state.mp3Instrument)?'练习编配':''}` : selected.length ?
    `已选 ${selected.length} 个轨道 · ${kinds.length>1?'合奏':names[kinds[0]]||'待指定乐器'}` : '已选 0 个轨道';
}
function renderTracks() {
  const box=$('trackList'); box.replaceChildren();
  if (!state.source.tracks.length) { box.textContent='没有可用音符轨道。'; renderSelection(); return; }
  for (const t of state.source.tracks) {
    const row=document.createElement('div'); row.className='track-item'; row.dataset.id=t.id;
    const checkbox=document.createElement('input'); checkbox.type='checkbox'; checkbox.value=t.id;
    checkbox.id=`track-${t.id.replace(/[^a-zA-Z0-9]/g,'-')}`;
    checkbox.addEventListener('change',() => {
      state.trackIds=checkbox.checked ?
        [...state.trackIds,t.id] :
        state.trackIds.filter(id=>id!==t.id);
      renderSelection();
    });
    const body=document.createElement('div'); body.className='track-body';
    const title=document.createElement('label'); title.htmlFor=checkbox.id; title.className='track-title'; title.textContent=t.name;
    const meta=document.createElement('small');
    meta.textContent=`轨道 ${t.sourceTrack} · 通道 ${t.channel+1} · ${t.instrumentName} · ${t.noteCount} 个音符`;
    body.append(title,meta);
    row.append(checkbox,body);
    if (t.detected==='unknown') {
      const assign=document.createElement('select'); assign.className='track-assign';
      assign.setAttribute('aria-label',`指定${t.name}的乐器`);
      for (const [value,label] of [['','指定乐器'],...instruments.map(id=>[id,names[id]])]) {
        const option=document.createElement('option'); option.value=value; option.textContent=label; assign.append(option);
      }
      assign.value=state.assignments[t.id]||'';
      assign.addEventListener('change',() => {
        if (assign.value) state.assignments[t.id]=assign.value;
        else delete state.assignments[t.id];
        renderSelection();
      });
      row.append(assign);
    } else {
      const pill=document.createElement('span'); pill.className='pill'; pill.textContent=state.source.inputType==='mp3'?'旋律':names[t.detected]; row.append(pill);
    }
    const previewButton=document.createElement('button'); previewButton.type='button';
    previewButton.className='ghost track-preview'; previewButton.dataset.id=t.id; previewButton.dataset.name=t.name;
    previewButton.textContent='▶ 试听'; previewButton.setAttribute('aria-label',`试听${t.name}`);
    previewButton.addEventListener('click',()=>guarded(()=>preview(t.id)));
    row.append(previewButton); box.append(row);
  }
  renderSelection();
}
function showSource(source) {
  player.stop(); previewPlayer.stop(); state.source=source; state.entry=null; state.mp3Instrument='piano';
  scoreCursor=null;scoreCursorTicks=[];
  state.trackIds=source.tracks.length?[source.tracks[0].id]:[]; state.assignments={}; resetPreviewButtons();
  $('emptyState').classList.add('hidden'); $('workspace').classList.remove('hidden'); $('result').classList.add('hidden');
  $('songTitle').value=source.title; $('pageTitle').textContent=source.title;
  $('pageSubtitle').textContent=source.inputType==='mp3' ?
    'SheetSage2 提取旋律、和弦及节拍。单旋律钢琴谱可自动编配左手；也可合并两条旋律，或生成其他乐器的练习编配。' :
    '选择轨道和难度；钢琴谱可分配左右手并添加指法。';
  $('selectionHelp').textContent=source.inputType==='mp3' ?
    '钢琴选单旋律时按预测和弦编配左手，选双旋律时分别分配左右手；吉他、贝斯、鼓生成练习编配。' :
    '同乐器合并为一个声部，不同乐器组成合奏谱。';
  $('trackHelp').textContent=source.inputType==='mp3' ?
    '可同时选择人声和器乐旋律；单条旋律也可以生成。' :
    '每个轨道都能单独试听；未识别的轨道请手动指定乐器';
  $('tempoValue').textContent=`${source.bpm} BPM${source.inputType==='mp3'?'（记谱基准）':''}`;
  $('timeValue').textContent=source.timeSignature.join('/');
  $('exportTranscribedMidi').classList.toggle('hidden',source.inputType!=='mp3');
  $('mp3InstrumentField').classList.toggle('hidden',source.inputType!=='mp3');
  $('mp3Instrument').value=state.mp3Instrument;
  const key=source.keyFifths, namesByFifths=source.keyMode?
    ['A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯','G♯','D♯','A♯']:
    ['C♭','G♭','D♭','A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯'];
  $('keyValue').textContent=source.keyProvided ?
    `${namesByFifths[Math.max(0,Math.min(14,key+7))]} ${source.keyMode?'小调':'大调'}` : '未提供';
  $('trackCount').textContent=String(source.tracks.length);
  $('sourceMeta').textContent=`${source.tracks.reduce((n,t)=>n+t.noteCount,0)} 个音符`;
  renderTracks(); notice(source.warnings.join(' '));
}
async function refreshLibrary() { state.library=await window.scoresprout.listLibrary(); renderLibrary(); }
function renderLibrary() {
  const box=$('libraryList'); box.replaceChildren(); $('libraryCount').textContent=state.library.length;
  const search=$('search').value.trim().toLowerCase(), inst=$('filterInstrument').value, diff=$('filterDifficulty').value;
  const items=state.library.filter(x=>(!search||x.title.toLowerCase().includes(search))&&(!inst||x.instrument===inst)&&(!diff||x.difficulty===diff));
  if (!items.length) {
    const p=document.createElement('div'); p.className='library-empty';
    p.textContent=state.library.length?'没有符合条件的版本':'还没有保存的乐谱';
    box.append(p); return;
  }
  for (const item of items) {
    const row=document.createElement('div'); row.className='library-row';
    const button=document.createElement('button');
    button.className=`library-item ${state.entry?.id===item.id&&state.entry?.songId===item.songId?'active':''}`;
    const title=document.createElement('strong'), meta=document.createElement('span');
    title.textContent=`${item.title} · ${levels[item.difficulty]}`;
    meta.textContent=`${names[item.instrument]||item.instrument} · ${item.trackName}`;
    button.append(title,meta);
    button.addEventListener('click',()=>guarded(()=>openLibrary(item)));
    const remove=document.createElement('button'); remove.type='button'; remove.className='library-delete';
    remove.textContent='删除'; remove.dataset.id=item.id;
    remove.setAttribute('aria-label',`删除 ${item.title} · ${levels[item.difficulty]} · ${names[item.instrument]}`);
    remove.addEventListener('click',()=>requestDelete(item));
    row.append(button,remove); box.append(row);
  }
}
function requestDelete(item) {
  if (!item || state.deleting) return;
  state.pendingDelete=item;
  $('deleteTitle').textContent=`删除「${item.title} · ${levels[item.difficulty]}」？`;
  $('deleteDetails').textContent=`${names[item.instrument]} · ${item.trackName}`;
  $('deleteError').textContent='';
  $('deleteDialog').showModal(); $('cancelDelete').focus();
}
async function confirmDeleteScore() {
  const item=state.pendingDelete;
  if (!item || state.deleting) return;
  state.deleting=true; $('confirmDelete').disabled=true; $('cancelDelete').disabled=true;
  try {
    const result=await window.scoresprout.deleteVersion(item.songId,item.id);
    if (state.entry?.id===item.id && state.entry?.songId===item.songId) {
      player.load([],120,'piano'); previewPlayer.stop(); resetPreviewButtons();
      scoreCursor=null;scoreCursorTicks=[];
      state.entry=null; $('playBtn').textContent='▶';
      $('score').replaceChildren(); $('result').classList.add('hidden');
    }
    await refreshLibrary(); $('deleteDialog').close();
    notice(result.warning || '乐谱已删除。原始 MIDI 已保留，可以重新选择轨道和难度生成。',result.warning?'':'success');
  } catch (error) {
    $('deleteError').textContent=error.message||String(error);
  } finally {
    state.deleting=false; $('confirmDelete').disabled=false; $('cancelDelete').disabled=false;
  }
}
async function renderVersion(data) {
  previewPlayer.stop(); resetPreviewButtons(); state.entry=data.entry||data;
  scoreCursor=null;scoreCursorTicks=[];
  const v=data.version; player.load(v.notes,v.bpm,v.instrument); $('playBtn').textContent='▶';
  $('result').classList.remove('hidden');
  $('resultTitle').textContent=`${v.title} · ${levels[v.difficulty]}`;
  const pianoInfo=v.pianoProcessing;
  const handLabel={pm2s:'PM2S 左右手','mp3-roles':'人声/器乐左右手','mp3-arrangement':'右手旋律 + 左手自动编配','existing-hands':'保留原有左右手','pitch-short':'短曲按音高分手','pitch-fallback':'按音高回退分手',pitch:'按音高分谱'};
  const pianoDescription=pianoInfo ? ` · ${handLabel[pianoInfo.handMethod]||'左右手已分配'} · ${pianoInfo.fingeringCount?`PianoPlayer 指法 ${pianoInfo.fingeringCount} 处`:'无指法'}` : '';
  $('resultDetails').textContent=`${names[v.instrument]} · ${v.trackName} · ${v.notes.length} 个音符${pianoDescription}${v.provenance?' · '+v.provenance:''}${pianoInfo?.warning?' · '+pianoInfo.warning:''}`;
  $('playingInstrument').textContent=names[v.instrument];
  const target=$('score'); target.replaceChildren();
  if (!window.opensheetmusicdisplay) throw new Error('乐谱渲染组件未加载。请重新安装依赖。');
  const osmd=new opensheetmusicdisplay.OpenSheetMusicDisplay(target,{
    autoResize:false,backend:'svg',drawTitle:false,drawComposer:false,drawPartNames:v.parts?.length>1,
    cursorsOptions:[{type:1,color:'#4eac62',alpha:.9,follow:false}]
  });
  await osmd.load(data.musicxml); osmd.render();attachScoreCursor(osmd,v);
  $('result').scrollIntoView({behavior:'smooth',block:'start'}); renderLibrary();
}
async function openLibrary(item) {
  const source=await window.scoresprout.getSource(item.songId); showSource(source);
  state.trackIds=(item.trackIds||[item.trackId]).filter(id=>source.tracks.some(t=>t.id===id));
  state.assignments=source.inputType==='mp3'?{}:{...(item.assignments||{})};
  if(source.inputType==='mp3'){
    state.mp3Instrument=instruments.includes(item.instrument)?item.instrument:'piano';
    $('mp3Instrument').value=state.mp3Instrument;
  }
  if (source.inputType!=='mp3'&&!item.assignments && item.instrument && source.tracks.find(t=>t.id===item.trackId)?.detected==='unknown')
    state.assignments[item.trackId]=item.instrument;
  renderTracks(); state.difficulty=item.difficulty;
  document.querySelectorAll('.difficulty-option').forEach(b=>b.classList.toggle('active',b.dataset.difficulty===state.difficulty));
  const loaded=await window.scoresprout.loadVersion(item.songId,item.id); await renderVersion(loaded);
}
async function importMidi() {
  const source=await window.scoresprout.importMidi();
  if (!source) return;
  showSource(source); await refreshLibrary();
}
async function importMp3() {
  const buttons=[$('importMp3Btn'),$('emptyImportMp3Btn')];
  buttons.forEach(button=>button.disabled=true);
  try {
    const picked=await window.scoresprout.selectAudio();
    if(!picked)return;
    if(picked.existing){
      showSource(picked.source);await refreshLibrary();
      return;
    }
    if(!window.ScoreTranscriber)throw new Error('音频转写组件未加载。');
    notice('正在解码 MP3…');
    const samples=await window.ScoreTranscriber.decodeMp3(picked.bytes);
    const stages={loading:'正在加载 SheetSage2 模型…',audio:'正在准备音频…',
      encoding:'正在分析音频…',decoding:'正在提取旋律…',notation:'正在整理 MIDI…'};
    const result=await window.scoresprout.transcribeAudio(picked.token,samples,
      progress=>notice(stages[progress.stage]||'正在转写音符…'));
    const source=await window.scoresprout.saveTranscription(picked.token);
    showSource(source);await refreshLibrary();
    notice(`SheetSage2 提取了人声 ${result.vocalNotes} 个、器乐 ${result.instrumentalNotes} 个音符。可合并两条旋律生成双手钢琴谱；其他乐器是练习编配。`,'success');
  } finally {buttons.forEach(button=>button.disabled=false);}
}
async function generate() {
  if (!state.source) return;
  if (!state.trackIds.length && !(state.source.inputType==='mp3'&&['bass','drums'].includes(state.mp3Instrument)))
    throw new Error('请先选择至少一条有音符的旋律或轨道。');
  const title=$('songTitle').value.trim(); if (!title) throw new Error('请填写歌曲名。');
  for (const track of state.source.tracks.filter(t=>state.trackIds.includes(t.id)))
    if(state.source.inputType!=='mp3')
    if (track.detected==='unknown'&&!instruments.includes(state.assignments[track.id]))
      throw new Error(`轨道「${track.name}」乐器未识别；请先试听并指定乐器。`);
  $('generateBtn').disabled=true; $('generateBtn').textContent='正在生成…';
  try {
    const data=await window.scoresprout.generate(state.source.id,state.trackIds,state.difficulty,title,state.assignments,
      state.source.inputType==='mp3'?state.mp3Instrument:null);
    await window.scoresprout.renameSong(state.source.id,title);
    state.source.title=title; $('pageTitle').textContent=title;
    await refreshLibrary(); await renderVersion(data);
    notice(data.version.pianoProcessing?.warning || '乐谱已保存到本地音乐库。',
      data.version.pianoProcessing?.warning ? '' : 'success');
  } finally {
    $('generateBtn').disabled=false; $('generateBtn').innerHTML='生成乐谱 <span>→</span>';
  }
}
async function preview(id) {
  if (!state.source) throw new Error('请先导入 MIDI。');
  const track=state.source.tracks.find(t=>t.id===id); if (!track) throw new Error('轨道不存在。');
  if (previewPlayer.playing && state.previewingTrackId===id) {
    previewPlayer.stop(); resetPreviewButtons(); return;
  }
  previewPlayer.stop(); resetPreviewButtons(); player.pause(); $('playBtn').textContent='▶';
  const data=await window.scoresprout.previewTrack(state.source.id,id);
  const instrument=selectedInstrument(track)||'piano';
  previewPlayer.load(data.notes.map(n=>({...n,instrument})),data.bpm,instrument);
  await previewPlayer.play(); state.previewingTrackId=id;
  document.querySelectorAll('.track-preview').forEach(button=>{if(button.dataset.id===id)button.textContent='■ 停止';});
  notice(`正在试听：${track.name}${track.detected==='unknown'&&!state.assignments[id]?'（暂用钢琴音色）':''}`,'success');
}
function bind() {
  $('importBtn').addEventListener('click',()=>guarded(importMidi));
  $('emptyImportBtn').addEventListener('click',()=>guarded(importMidi));
  $('importMp3Btn').addEventListener('click',()=>guarded(importMp3));
  $('emptyImportMp3Btn').addEventListener('click',()=>guarded(importMp3));
  $('exportTranscribedMidi').addEventListener('click',()=>guarded(async()=>{
    if(!state.source||state.source.inputType!=='mp3')return;
    const file=await window.scoresprout.exportSourceMidi(state.source.id);
    if(file)notice(`已导出转写 MIDI：${file}`,'success');
  }));
  $('generateBtn').addEventListener('click',()=>guarded(generate));
  $('mp3Instrument').addEventListener('change',event=>{state.mp3Instrument=event.target.value;renderSelection();});
  $('deleteScore').addEventListener('click',()=>requestDelete(state.entry));
  $('cancelDelete').addEventListener('click',()=>{if(!state.deleting)$('deleteDialog').close();});
  $('confirmDelete').addEventListener('click',confirmDeleteScore);
  $('deleteDialog').addEventListener('cancel',event=>{if(state.deleting)event.preventDefault();});
  $('deleteDialog').addEventListener('close',()=>{if(!$('deleteDialog').open)state.pendingDelete=null;});
  $('songTitle').addEventListener('change',()=>guarded(async()=>{
    if(state.source) {
      const name=await window.scoresprout.renameSong(state.source.id,$('songTitle').value);
      state.source.title=name; $('pageTitle').textContent=name; await refreshLibrary();
    }
  }));
  document.querySelectorAll('.difficulty-option').forEach(b=>b.addEventListener('click',()=>{
    state.difficulty=b.dataset.difficulty;
    document.querySelectorAll('.difficulty-option').forEach(x=>x.classList.toggle('active',x===b));
  }));
  for (const id of ['search','filterInstrument','filterDifficulty'])
    $(id).addEventListener(id==='search'?'input':'change',renderLibrary);
  $('playBtn').addEventListener('click',()=>guarded(async()=>{
    previewPlayer.stop(); resetPreviewButtons();
    if(player.playing) { player.pause(); $('playBtn').textContent='▶'; }
    else { await player.play(); $('playBtn').textContent='Ⅱ'; }
  }));
  $('stopBtn').addEventListener('click',()=>{player.stop(); $('playBtn').textContent='▶';});
  $('seek').addEventListener('input',e=>player.seek(Number(e.target.value)/1000*(player.duration||0)));
  for(const [id,format] of [['exportMidi','mid'],['exportXml','musicxml']])
    $(id).addEventListener('click',()=>guarded(async()=>{
      if(!state.entry) return;
      const file=await window.scoresprout.exportVersion(state.entry.songId,state.entry.id,format);
      if(file) notice(`已导出：${file}`,'success');
    }));
}
bind(); guarded(refreshLibrary);
