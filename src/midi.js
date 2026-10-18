const { parseMidi, writeMidi } = require('midi-file');

const INSTRUMENTS = { piano: '钢琴', guitar: '吉他', drums: '鼓', bass: '贝斯' };
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
    const opened = new Map(), groups = new Map();
    for (const event of midi.tracks[ti]) {
      tick += event.deltaTime || 0;
      if (event.type === 'trackName') { trackName = decodeText(event.text); if (ti === 0 && trackName) title = trackName; }
      if (event.type === 'instrumentName') instrumentName = decodeText(event.text);
      if (event.type === 'setTempo') tempos.push({ tick, microsecondsPerBeat: event.microsecondsPerBeat });
      if (event.type === 'timeSignature') times.push({ tick, numerator: event.numerator, denominator: event.denominator });
      if (event.type === 'keySignature') keys.push({ tick, key: event.key, scale: event.scale });
      if (event.type === 'programChange') programs[event.channel] = event.programNumber;
      if (event.type === 'noteOn' && event.velocity > 0) {
        const k = `${event.channel}:${event.noteNumber}`;
        if (!opened.has(k)) opened.set(k, []);
        opened.get(k).push({ tick, velocity: event.velocity, program: programs[event.channel] });
      }
      if (event.type === 'noteOff' || (event.type === 'noteOn' && event.velocity === 0)) {
        const k = `${event.channel}:${event.noteNumber}`, stack = opened.get(k);
        if (!stack?.length) continue;
        const on = stack.shift(), groupKey = `${event.channel}:${on.program}`;
        if (!groups.has(groupKey)) groups.set(groupKey, { channel: event.channel, program: on.program, notes: [] });
        groups.get(groupKey).notes.push({ pitch: event.noteNumber, start: on.tick, duration: Math.max(1, tick - on.tick), velocity: on.velocity });
      }
    }
    for (const [k, stack] of opened) for (const on of stack) {
      const [channel, pitch] = k.split(':').map(Number), groupKey = `${channel}:${on.program}`;
      if (!groups.has(groupKey)) groups.set(groupKey, { channel, program: on.program, notes: [] });
      groups.get(groupKey).notes.push({ pitch, start: on.tick, duration: Math.max(1, tick - on.tick), velocity: on.velocity });
      warnings.push(`轨道 ${ti + 1} 有未结束的音符，已在轨道末尾收束。`);
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
  if (!tracks.length) warnings.push('没有找到可用音符；请检查 MIDI 文件。');
  return { title, sourcePpq, bpm: Math.round(60000000 / (tempos[0]?.microsecondsPerBeat || 500000)),
    timeSignature: times.length ? [times[0].numerator, times[0].denominator] : [4, 4],
    keyFifths: keys[0]?.key || 0, keyMode: keys[0]?.scale || 0, keyProvided:keys.length>0, tracks, warnings };
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
    const k = difficulty === 'beginner' ? Math.floor(n.start / grid) : Math.round(n.start / grid);
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
      const copy = { ...n, start: bucket * grid, duration: difficulty === 'beginner' ? Math.min(Math.max(n.duration, grid), ppq * 2) : n.duration };
      if (instrument !== 'drums') {
        const ranges = { piano: [48,84], guitar: [40,88], bass: [28,60] };
        const [low, high] = ranges[instrument]; copy.pitch = clampPitch(copy.pitch, low, high);
        const hand = instrument === 'piano' && copy.pitch < 60 ? 'low' : 'high';
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

function generateVersion(source, trackId, instrument, difficulty, title, manual = false) {
  if (!INSTRUMENTS[instrument] || !DIFFICULTIES[difficulty]) throw new Error('请选择有效的乐器和难度。');
  const track = source.tracks.find(t => t.id === trackId);
  if (!track?.notes.length) throw new Error('所选轨道没有可用音符，无法生成乐谱。');
  if (track.detected !== instrument && (track.detected !== 'unknown' || !manual))
    throw new Error(track.detected === 'unknown' ? '此轨道乐器未识别；请试听后勾选“手动指定”。' : `此轨道已识别为${INSTRUMENTS[track.detected]}，不能作为${INSTRUMENTS[instrument]}生成乐谱。`);
  const ppq = 480, grid = difficulty === 'full' ? 120 : difficulty === 'intermediate' ? 240 : 480;
  const scaled = track.notes.slice(0, 8000).map(n => ({ pitch: n.pitch,
    start: n.start * ppq / source.sourcePpq, duration: n.duration * ppq / source.sourcePpq, velocity: n.velocity }));
  const chosen = selectNotes(scaled, instrument, difficulty, ppq);
  const notes = chosen.map(n => ({ pitch: n.pitch, start: Math.max(0, Math.round(n.start / grid) * grid),
    duration: instrument === 'drums' ? grid : Math.max(grid, Math.round(n.duration / grid) * grid), velocity: n.velocity }))
    .sort((a,b) => a.start - b.start || a.pitch - b.pitch);
  if (!notes.length) throw new Error(`此轨道没有适合${INSTRUMENTS[instrument]}的可用音符，未生成乐谱。`);
  return { title: (title || source.title).trim() || source.title, instrument, difficulty, trackId,
    trackName: track.name, sourceTrack: track.sourceTrack, bpm: source.bpm,
    timeSignature: source.timeSignature, keyFifths: source.keyFifths, keyMode:source.keyMode, ppq, notes };
}

function versionToMidi(version) {
  const events = [{ tick: 0, order: 0, type: 'trackName', text: encodeText(`${version.title} · ${DIFFICULTIES[version.difficulty]}`) },
    { tick: 0, order: 0, type: 'setTempo', microsecondsPerBeat: Math.round(60000000 / version.bpm) },
    { tick: 0, order: 0, type: 'timeSignature', numerator: version.timeSignature[0], denominator: version.timeSignature[1], metronome: 24, thirtyseconds: 8 },
    { tick: 0, order: 0, type: 'keySignature', key: version.keyFifths, scale: version.keyMode || 0 },
    { tick: 0, order: 0, type: 'programChange', channel: version.instrument === 'drums' ? 9 : 0,
      programNumber: { piano: 0, guitar: 24, bass: 33, drums: 0 }[version.instrument] }];
  const channel = version.instrument === 'drums' ? 9 : 0;
  for (const n of version.notes) {
    events.push({ tick: n.start, order: 2, type: 'noteOn', channel, noteNumber: n.pitch, velocity: Math.max(1, Math.min(127,n.velocity)) });
    events.push({ tick: n.start + n.duration, order: 1, type: 'noteOff', channel, noteNumber: n.pitch, velocity: 0 });
  }
  events.sort((a,b) => a.tick - b.tick || a.order - b.order);
  let last = 0;
  const track = events.map(({tick,order,...event}) => { const e = { deltaTime: tick - last, ...event }; last = tick; return e; });
  track.push({ deltaTime: 0, type: 'endOfTrack' });
  return Buffer.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: version.ppq }, tracks: [track] }));
}

module.exports = { analyzeMidi, generateVersion, versionToMidi, INSTRUMENTS, DIFFICULTIES, identify };
