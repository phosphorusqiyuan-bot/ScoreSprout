const { parseMidi, writeMidi } = require('midi-file');
const { arrangeMp3 } = require('./mp3-arrangement');
const { inferKey } = require('./key-analysis');

const INSTRUMENTS = { piano: '钢琴', guitar: '吉他', drums: '鼓', bass: '贝斯', ensemble: '合奏' };
const DIFFICULTIES = { beginner: '新手版', intermediate: '进阶版', full: '完整版' };
const GM_FAMILIES = ['钢琴', '半音阶打击乐', '风琴', '吉他', '贝斯', '弦乐', '合奏', '铜管', '簧管', '笛', '合成主音', '合成铺底', '合成音效', '民族乐器', '打击乐', '音效'];
function decodeText(value) {
  if (!value) return '';
  const bytes=Uint8Array.from(value,c=>c.charCodeAt(0)&255);
  try { return new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
  catch { try { return new TextDecoder('gbk',{fatal:true}).decode(bytes); } catch { return value; } }
}
const encodeText = value => Buffer.from(value,'utf8').toString('latin1');

function family(program) { return GM_FAMILIES[Math.floor(program / 8)] || '未知乐器'; }
function identify(channel, program, name = '') {
  if (channel === 9) return 'drums';
  if (program >= 0 && program < 8) return 'piano';
  if (program >= 24 && program < 32) return 'guitar';
  if (program >= 32 && program < 40) return 'bass';
  const n = name.toLowerCase();
  if (/piano|keys|keyboard|钢琴/.test(n)) return 'piano';
  if (/guitar|吉他/.test(n)) return 'guitar';
  if (/bass|贝斯|低音吉他/.test(n)) return 'bass';
  if (/drum|perc|kit|鼓/.test(n)) return 'drums';
  return 'unknown';
}

function analyzeMidi(input, filename = '未命名.mid') {
  let midi;
  try { midi = parseMidi(Buffer.from(input)); }
  catch (error) { throw new Error(`MIDI 文件无法读取：${error.message}`); }
  const sourcePpq = midi.header.ticksPerBeat;
  if (!sourcePpq) throw new Error('此 MIDI 使用 SMPTE 时间格式，第一版暂不支持。');
  const warnings = [];
  const tempos = [], times = [], keys = [];
  const tracks = [];
  let title = filename.replace(/\.(mid|midi)$/i, '') || '未命名歌曲';
  for (let ti = 0; ti < midi.tracks.length; ti++) {
    let tick = 0, trackName = '', instrumentName = '';
    const programs = Array(16).fill(-1);
    const opened = new Map(), released = new Map(), groups = new Map();
    const pedal = Array(16).fill(false);
    const finishNote = (channel, pitch, on, endTick) => {
      const groupKey = `${channel}:${on.program}`;
      if (!groups.has(groupKey)) groups.set(groupKey, { channel, program: on.program, notes: [] });
      groups.get(groupKey).notes.push({ pitch, start: on.tick, duration: Math.max(1, endTick - on.tick), velocity: on.velocity });
    };
    const releasePedal = (channel, endTick, pitch = null) => {
      const held = released.get(channel) || [];
      for (let i = held.length - 1; i >= 0; i--) {
        if (pitch !== null && held[i].pitch !== pitch) continue;
        finishNote(channel, held[i].pitch, held[i].on, endTick);
        held.splice(i, 1);
      }
    };
    for (const event of midi.tracks[ti]) {
      tick += event.deltaTime || 0;
      if (event.type === 'trackName') { trackName = decodeText(event.text); if (ti === 0 && trackName) title = trackName; }
      if (event.type === 'instrumentName') instrumentName = decodeText(event.text);
      if (event.type === 'setTempo') tempos.push({ tick, microsecondsPerBeat: event.microsecondsPerBeat });
      if (event.type === 'timeSignature') times.push({ tick, numerator: event.numerator, denominator: event.denominator });
      if (event.type === 'keySignature') keys.push({ tick, key: event.key, scale: event.scale });
      if (event.type === 'programChange') programs[event.channel] = event.programNumber;
      if (event.type === 'controller' && event.controllerType === 64 && event.channel !== 9) {
        const down = event.value >= 64;
        if (pedal[event.channel] && !down) releasePedal(event.channel, tick);
        pedal[event.channel] = down;
      }
      if (event.type === 'noteOn' && event.velocity > 0) {
        releasePedal(event.channel, tick, event.noteNumber);
        const k = `${event.channel}:${event.noteNumber}`;
        if (!opened.has(k)) opened.set(k, []);
        opened.get(k).push({ tick, velocity: event.velocity, program: programs[event.channel] });
      }
      if (event.type === 'noteOff' || (event.type === 'noteOn' && event.velocity === 0)) {
        const k = `${event.channel}:${event.noteNumber}`, stack = opened.get(k);
        if (!stack?.length) continue;
        const on = stack.shift();
        if (pedal[event.channel] && event.channel !== 9) {
          if (!released.has(event.channel)) released.set(event.channel, []);
          released.get(event.channel).push({ pitch: event.noteNumber, on });
        } else finishNote(event.channel, event.noteNumber, on, tick);
      }
    }
    for (const [k, stack] of opened) for (const on of stack) {
      const [channel, pitch] = k.split(':').map(Number);
      finishNote(channel, pitch, on, tick);
      warnings.push(`轨道 ${ti + 1} 有未结束的音符，已在轨道末尾收束。`);
    }
    for (const channel of released.keys()) {
      if (released.get(channel).length && pedal[channel]) warnings.push(`轨道 ${ti + 1} 的延音踏板未释放，已在轨道末尾收束。`);
      releasePedal(channel, tick);
    }
    if (groups.size > 1) warnings.push(`轨道 ${ti + 1} 包含多个通道或乐器，已拆分供选择。`);
    if (!groups.size) warnings.push(`轨道 ${ti + 1} 没有可用音符，已略过。`);
    for (const [key, group] of groups) {
      if (!group.notes.length) continue;
      const detected = identify(group.channel, group.program, `${trackName} ${instrumentName}`);
      tracks.push({ id: `${ti}:${key}`, sourceTrack: ti + 1, channel: group.channel, program: group.program,
        name: trackName || `轨道 ${ti + 1}`, instrumentName: instrumentName || (group.program >= 0 ? family(group.program) : '未指定'),
        detected, notes: group.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch) });
    }
  }
  tempos.sort((a,b) => a.tick - b.tick); times.sort((a,b) => a.tick - b.tick); keys.sort((a,b) => a.tick - b.tick);
  if (!tempos.length) warnings.push('文件没有速度信息，按 120 BPM 处理。');
  if (tempos.length > 1) warnings.push('文件有多次速度变化；第一版生成谱使用初始速度。');
  if (times.length > 1) warnings.push('文件有拍号变化；第一版生成谱使用初始拍号。');
  if (keys.length > 1) warnings.push('文件有调号变化；生成谱使用初始调号。');
  if (!tracks.length) warnings.push('没有找到可用音符；请检查 MIDI 文件。');
  const statedKey=keys.find(k=>Number.isInteger(k.key) && k.key>=-7 && k.key<=7 && (k.scale===0 || k.scale===1));
  if (keys.length && !statedKey) warnings.push('文件中的调号无效，尝试根据音符推断。');
  const keyAnalysis=inferKey(tracks,sourcePpq);
  if (!statedKey && !keyAnalysis && tracks.some(t=>t.channel!==9)) warnings.push('音符不足或调性不明确，无法可靠识别调号；乐谱暂用无升降号记谱。');
  return { title, sourcePpq, bpm: Math.round(60000000 / (tempos[0]?.microsecondsPerBeat || 500000)),
    timeSignature: times.length ? [times[0].numerator, times[0].denominator] : [4, 4],
    keyFifths: statedKey?.key ?? keyAnalysis?.fifths ?? 0,
    keyMode: statedKey?.scale ?? keyAnalysis?.mode ?? 0,
    keyProvided:!!statedKey, keyInferred:!statedKey && !!keyAnalysis, keyAnalysis, tracks, warnings };
}

function clampPitch(p, low, high) {
  while (p < low) p += 12;
  while (p > high) p -= 12;
  return Math.max(low, Math.min(high, p));
}
function selectNotes(notes, instrument, difficulty, ppq) {
  if (difficulty === 'full' && instrument === 'guitar') {
    const groups=new Map();
    for(const n of notes){const start=Math.round(n.start/(ppq/4));if(!groups.has(start))groups.set(start,[]);groups.get(start).push(n);}
    return [...groups.values()].flatMap(group=>{
      const playable=group.map(n=>({...n,pitch:clampPitch(n.pitch,40,88)})).sort((a,b)=>a.pitch-b.pitch);
      return playable.length<=6?playable:[playable[0],...playable.slice(-5)];
    });
  }
  if (difficulty === 'full') return notes;
  const grid = difficulty === 'beginner' ? ppq : ppq / 2;
  const buckets = new Map();
  for (const n of notes) {
    const k = Math.floor(n.start / grid);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(n);
  }
  const result = [], last = { high: null, low: null };
  for (const [bucket, group] of [...buckets].sort((a,b) => a[0] - b[0])) {
    let chosen = [];
    const sorted = [...group].sort((a,b) => a.pitch - b.pitch);
    if (instrument === 'drums') {
      const allowed = difficulty === 'beginner' ? [36,38,42] : [35,36,38,40,42,44,46,49,51];
      chosen = sorted.filter(n => allowed.includes(n.pitch));
      chosen = [...new Map(chosen.map(n => [n.pitch, n])).values()];
    } else if (instrument === 'bass') {
      chosen = sorted.length ? [sorted[0]] : [];
    } else if (instrument === 'guitar') {
      chosen = difficulty === 'beginner' ? sorted.slice(-1) : sorted.length <= 3 ? sorted : [sorted[0], ...sorted.slice(-2)];
    } else {
      chosen = sorted.length === 1 ? sorted : [sorted[0], sorted.at(-1)];
      if (difficulty === 'intermediate' && sorted.length > 2) chosen.splice(1, 0, sorted[Math.floor(sorted.length / 2)]);
    }
    for (const n of chosen) {
      // The coarse bucket chooses which notes survive; it must not move their
      // onsets to the bucket boundary, which changes the melody's rhythm.
      const copy = { ...n, duration: Math.max(ppq / 4, n.duration) };
      if (instrument !== 'drums') {
        const ranges = { piano: [48,84], guitar: [40,88], bass: [28,60] };
        const [low, high] = ranges[instrument]; copy.pitch = clampPitch(copy.pitch, low, high);
        const hand = instrument === 'piano' && (copy.hand==='left'||(!copy.hand&&copy.pitch<60)) ? 'low' : 'high';
        if (last[hand] != null && difficulty === 'beginner') {
          while (copy.pitch - last[hand] > 12 && copy.pitch - 12 >= low) copy.pitch -= 12;
          while (last[hand] - copy.pitch > 12 && copy.pitch + 12 <= high) copy.pitch += 12;
        }
        last[hand] = copy.pitch;
      }
      result.push(copy);
    }
  }
  return result;
}

function generateVersion(source, trackIds, instrument, difficulty, title, manual = false) {
  if ((instrument !== 'auto' && !['piano','guitar','bass','drums'].includes(instrument)) || !DIFFICULTIES[difficulty])
    throw new Error('请选择有效的乐器和难度。');
  const ids = [...new Set(Array.isArray(trackIds) ? trackIds : [trackIds])].filter(id=>id!=null);
  if (ids.some(id => typeof id !== 'string') || (!ids.length && source.inputType!=='mp3'))
    throw new Error('请至少选择一个有音符的轨道。');
  const tracks = ids.map(id => source.tracks.find(t => t.id === id));
  if (tracks.some(t => !t?.notes.length)) throw new Error('所选轨道没有可用音符，无法生成乐谱。');
  const assignments = {}, groups = new Map();
  let arrangement=null;
  if(source.inputType==='mp3'){
    const target=instrument==='auto'?'piano':instrument;
    arrangement=arrangeMp3(source,tracks,target,difficulty);
    groups.set(target,[{id:'mp3-arrangement',name:arrangement.trackName,notes:arrangement.notes}]);
  }else for (const track of tracks) {
    let target = track.detected;
    if (target === 'unknown') {
      target = typeof manual === 'object' && manual !== null ? manual[track.id] : manual ? instrument : null;
      if (!['piano','guitar','bass','drums'].includes(target))
        throw new Error(`轨道「${track.name}」乐器未识别；请试听后手动指定。`);
      assignments[track.id] = target;
    } else if (instrument !== 'auto' && target !== instrument) {
      throw new Error(`轨道「${track.name}」已识别为${INSTRUMENTS[target]}，不能作为${INSTRUMENTS[instrument]}生成乐谱。`);
    }
    if (!groups.has(target)) groups.set(target, []);
    groups.get(target).push(track);
  }
  const ppq = 480;
  // Full scores need a finer grid: a sixteenth-note snap can move a note by
  // 62.5 ms at 120 BPM, which audibly changes swung or freely played rhythms.
  const grid = {full:30,intermediate:60,beginner:120}[difficulty];
  const parts = [];
  for (const target of ['piano','guitar','bass','drums']) {
    const selected = groups.get(target);
    if (!selected) continue;
    const tempoScale=source.inputType==='mp3' ? source.bpm/(source.audioBaseBpm||source.bpm) : 1;
    let scaled = selected.flatMap(track => track.notes.map(n => ({ pitch:n.pitch,
      start:n.start*ppq/source.sourcePpq*tempoScale, duration:n.duration*ppq/source.sourcePpq*tempoScale,
      velocity:n.velocity,hand:n.hand,sourceTrackId:track.id })))
      .sort((a,b) => a.start-b.start || a.pitch-b.pitch).slice(0,8000);
    const chosen = target==='piano' && source.inputType==='mp3' ?
      ['right','left'].flatMap(hand=>selectNotes(scaled.filter(note=>note.hand===hand),target,difficulty,ppq)) :
      selectNotes(scaled,target,difficulty,ppq);
    const unique = new Map();
    for (const n of chosen) {
      const start = Math.max(0,Math.round(n.start/grid)*grid);
      const end = Math.round((n.start+n.duration)/grid)*grid;
      const note = { pitch:n.pitch,start,duration:target === 'drums' ? grid : Math.max(grid,end-start),
        velocity:n.velocity,instrument:target,...(n.hand?{hand:n.hand}:{}) };
      const key = `${start}:${n.pitch}:${target==='piano'?(n.hand||'') : ''}`, previous = unique.get(key);
      if (!previous) unique.set(key,note);
      else { previous.duration=Math.max(previous.duration,note.duration); previous.velocity=Math.max(previous.velocity,note.velocity); }
    }
    const notes = [...unique.values()].sort((a,b) => a.start-b.start || a.pitch-b.pitch);
    if (notes.length) parts.push({ instrument:target,trackIds:arrangement?arrangement.trackIds:selected.map(t=>t.id),
      trackName:selected.map(t=>t.name).join(' + '),notes });
  }
  if (!parts.length) throw new Error('所选轨道没有可用于生成乐谱的音符。');
  const notes = parts.flatMap(part=>part.notes).sort((a,b)=>a.start-b.start || a.pitch-b.pitch);
  return { title:(title || source.title).trim() || source.title,
    instrument:parts.length === 1 ? parts[0].instrument : 'ensemble',difficulty,
    trackId:ids[0]||null,trackIds:arrangement?arrangement.trackIds:ids,
    trackName:arrangement?arrangement.trackName:tracks.map(t=>t.name).join(' + '),
    sourceTrack:tracks[0]?.sourceTrack||null,assignments,bpm:source.bpm,
    ...(arrangement?{provenance:arrangement.provenance,
      ...(arrangement.pianoAccompaniment?{mp3PianoAccompaniment:true}:{})}:{}),
    timeSignature:source.timeSignature,keyFifths:source.keyFifths,keyMode:source.keyMode,ppq,notes,parts };
}

function versionToMidi(version) {
  const parts = version.parts?.length ? version.parts : [{ instrument:version.instrument,notes:version.notes,trackName:version.trackName }];
  const midiParts = parts.flatMap(part => {
    if(part.instrument!=='piano'||!part.notes.some(note=>note.hand==='left'||note.hand==='right'))return [part];
    return ['right','left'].map(hand=>({instrument:'piano',trackName:`${part.trackName||'钢琴'}（${hand==='right'?'右手':'左手'}）`,
      notes:part.notes.filter(note=>(note.hand||(note.pitch<60?'left':'right'))===hand)})).filter(item=>item.notes.length);
  });
  let pitchedChannel = 0;
  const tracks = midiParts.map((part,index) => {
    const channel = part.instrument === 'drums' ? 9 : pitchedChannel++;
    const events = [{ tick:0,order:0,type:'trackName',
      text:encodeText(midiParts.length === 1 ? `${version.title} · ${DIFFICULTIES[version.difficulty]}` : `${INSTRUMENTS[part.instrument]} · ${part.trackName}`) },
      { tick:0,order:0,type:'programChange',channel,programNumber:{piano:0,guitar:24,bass:33,drums:0}[part.instrument] }];
    if (index === 0) events.push(
      { tick:0,order:0,type:'setTempo',microsecondsPerBeat:Math.round(60000000/version.bpm) },
      { tick:0,order:0,type:'timeSignature',numerator:version.timeSignature[0],denominator:version.timeSignature[1],metronome:24,thirtyseconds:8 },
      { tick:0,order:0,type:'keySignature',key:version.keyFifths,scale:version.keyMode || 0 });
    for (const n of part.notes) {
      events.push({ tick:n.start,order:2,type:'noteOn',channel,noteNumber:n.pitch,velocity:Math.max(1,Math.min(127,n.velocity)) });
      events.push({ tick:n.start+n.duration,order:1,type:'noteOff',channel,noteNumber:n.pitch,velocity:0 });
    }
    events.sort((a,b)=>a.tick-b.tick || a.order-b.order);
    let last = 0;
    const track = events.map(({tick,order,...event}) => { const e={deltaTime:tick-last,...event};last=tick;return e; });
    track.push({deltaTime:0,type:'endOfTrack'});
    return track;
  });
  return Buffer.from(writeMidi({header:{format:tracks.length>1?1:0,numTracks:tracks.length,ticksPerBeat:version.ppq},tracks}));
}

module.exports = { analyzeMidi, generateVersion, versionToMidi, INSTRUMENTS, DIFFICULTIES, identify };
