const $ = id => document.getElementById(id);
const names = { piano:'钢琴', guitar:'吉他', drums:'鼓', bass:'贝斯', ensemble:'合奏' };
const levels = { beginner:'新手版', intermediate:'进阶版', full:'完整版' };
const instruments = ['piano','guitar','bass','drums'];
const state = { source:null, trackIds:[], assignments:{}, difficulty:'beginner', entry:null, library:[], previewingTrackId:null, pendingDelete:null, deleting:false };
const formatTime = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const player = new ScorePlayer((now,total) => {
  $('currentTime').textContent=formatTime(now);
  $('totalTime').textContent=formatTime(total);
  $('seek').value=total ? Math.round(now/total*1000) : 0;
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
function selectedInstrument(track) { return track.detected==='unknown' ? state.assignments[track.id] : track.detected; }
function renderSelection() {
  if (!state.source) return;
  for (const row of document.querySelectorAll('.track-item')) {
    const selected=state.trackIds.includes(row.dataset.id);
    row.classList.toggle('selected',selected);
    row.querySelector('input[type="checkbox"]').checked=selected;
  }
  const selected=state.source.tracks.filter(t=>state.trackIds.includes(t.id));
  const kinds=[...new Set(selected.map(selectedInstrument).filter(Boolean))];
  $('selectionSummary').textContent=selected.length ?
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
      state.trackIds=checkbox.checked ? [...state.trackIds,t.id] : state.trackIds.filter(id=>id!==t.id);
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
      const choices=state.source.inputType==='mp3'?instruments.filter(id=>id!=='drums'):instruments;
      for (const [value,label] of [['','指定乐器'],...choices.map(id=>[id,names[id]])]) {
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
      const pill=document.createElement('span'); pill.className='pill'; pill.textContent=names[t.detected]; row.append(pill);
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
  player.stop(); previewPlayer.stop(); state.source=source; state.entry=null;
  state.trackIds=source.tracks.length?[source.tracks[0].id]:[]; state.assignments={}; resetPreviewButtons();
  $('emptyState').classList.add('hidden'); $('workspace').classList.remove('hidden'); $('result').classList.add('hidden');
  $('songTitle').value=source.title; $('pageTitle').textContent=source.title;
  $('pageSubtitle').textContent=source.inputType==='mp3' ?
    '已从 MP3 估计音符。请试听轨道，指定乐器，再选择难度。' :
    '选择轨道和难度，生成适合自己的乐谱。';
  $('tempoValue').textContent=`${source.bpm} BPM${source.inputType==='mp3'?'（估）':''}`;
  $('timeValue').textContent=source.timeSignature.join('/');
  $('exportTranscribedMidi').classList.toggle('hidden',source.inputType!=='mp3');
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
      state.entry=null; $('playBtn').textContent='▶';
      $('score').replaceChildren(); $('result').classList.add('hidden');
    }
    state.library=state.library.filter(v=>v.id!==item.id||v.songId!==item.songId);
    renderLibrary(); $('deleteDialog').close();
    notice(result.warning || '乐谱已删除。原始 MIDI 已保留，可以重新选择轨道和难度生成。',result.warning?'':'success');
  } catch (error) {
    $('deleteError').textContent=error.message||String(error);
  } finally {
    state.deleting=false; $('confirmDelete').disabled=false; $('cancelDelete').disabled=false;
  }
}
async function renderVersion(data) {
  previewPlayer.stop(); resetPreviewButtons(); state.entry=data.entry||data;
  const v=data.version; player.load(v.notes,v.bpm,v.instrument); $('playBtn').textContent='▶';
  $('result').classList.remove('hidden');
  $('resultTitle').textContent=`${v.title} · ${levels[v.difficulty]}`;
  $('resultDetails').textContent=`${names[v.instrument]} · ${v.trackName} · ${v.notes.length} 个音符`;
  $('playingInstrument').textContent=names[v.instrument];
  const target=$('score'); target.replaceChildren();
  if (!window.opensheetmusicdisplay) throw new Error('乐谱渲染组件未加载。请重新安装依赖。');
  const osmd=new opensheetmusicdisplay.OpenSheetMusicDisplay(target,{
    autoResize:true,backend:'svg',drawTitle:false,drawComposer:false,drawPartNames:v.parts?.length>1
  });
  await osmd.load(data.musicxml); osmd.render();
  $('result').scrollIntoView({behavior:'smooth',block:'start'}); renderLibrary();
}
async function openLibrary(item) {
  const source=await window.scoresprout.getSource(item.songId); showSource(source);
  state.trackIds=(item.trackIds||[item.trackId]).filter(id=>source.tracks.some(t=>t.id===id));
  state.assignments={...(item.assignments||{})};
  if (!item.assignments && item.instrument && source.tracks.find(t=>t.id===item.trackId)?.detected==='unknown')
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
    if(picked.existing){showSource(picked.source);await refreshLibrary();return;}
    if(!window.ScoreTranscriber)throw new Error('音频转写组件未加载。');
    notice('正在解码 MP3…');
    const output=await window.ScoreTranscriber.transcribeMp3(picked.bytes,
      progress=>notice(`正在转写音符… ${Math.round(progress*100)}%`));
    const source=await window.scoresprout.saveTranscription(picked.token,output.notes);
    showSource(source);await refreshLibrary();
    notice(`已从 MP3 转写 ${output.notes.length} 个音符。请试听后指定乐器；复杂混音可能需要人工修正。`,'success');
  } finally {buttons.forEach(button=>button.disabled=false);}
}
async function generate() {
  if (!state.source) return;
  if (!state.trackIds.length) throw new Error('请先选择至少一个有音符的轨道。');
  const title=$('songTitle').value.trim(); if (!title) throw new Error('请填写歌曲名。');
  for (const track of state.source.tracks.filter(t=>state.trackIds.includes(t.id)))
    if (track.detected==='unknown'&&!instruments.includes(state.assignments[track.id]))
      throw new Error(`轨道「${track.name}」乐器未识别；请先试听并指定乐器。`);
  $('generateBtn').disabled=true; $('generateBtn').textContent='正在生成…';
  try {
    const data=await window.scoresprout.generate(state.source.id,state.trackIds,state.difficulty,title,state.assignments);
    await window.scoresprout.renameSong(state.source.id,title);
    state.source.title=title; $('pageTitle').textContent=title;
    await refreshLibrary(); await renderVersion(data); notice('乐谱已保存到本地音乐库。','success');
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
