const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { versionToMusicXML } = require('./musicxml');

const root = path.join(__dirname, '..');
const bridge = path.join(root, 'scripts', 'piano_bridge.py');
const runtimes = ['.sheetsage2-runtime', '.piano-runtime'].map(name => path.join(root, name));

function findRuntime() {
  for (const runtime of runtimes) {
    const python = path.join(runtime, 'venv', 'Scripts', 'python.exe');
    const weights = path.join(runtime, 'RNNHandPartModel.pth');
    if (fs.existsSync(path.join(runtime, 'piano-ready')) && fs.existsSync(python) && fs.existsSync(weights))
      return { python, weights };
  }
  return null;
}

function runPython(python, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [bridge, ...args], { cwd:root, windowsHide:true,
      env:{...process.env, PYTHONIOENCODING:'utf-8', CUDA_VISIBLE_DEVICES:''} });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-3000); });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split('\n').at(-1) || '钢琴处理进程失败或超时。'));
    });
  });
}

function applyHandResults(part, hands, inputType) {
  if (!Array.isArray(hands) || hands.length !== part.notes.length ||
      hands.some(hand => hand !== 'left' && hand !== 'right'))
    throw new Error('PM2S 返回了无效的左右手结果。');
  const explicit = part.notes.every(note => note.hand === 'left' || note.hand === 'right');
  const explicitSides = new Set(part.notes.map(note => note.hand));
  // A single SheetSage2 melody is not a two-hand piano performance. When both
  // melody roles exist, use PM2S only if it broadly agrees with those roles.
  if (inputType === 'mp3' && explicit && explicitSides.size === 1) return 'mp3-roles';
  if (inputType === 'mp3' && explicit) {
    const agreement = hands.filter((hand, i) => hand === part.notes[i].hand).length / hands.length;
    if (agreement < 0.8 || new Set(hands).size < 2) return 'mp3-roles';
  }
  if (part.notes.length < 12) {
    if (explicit) return 'existing-hands';
    part.notes.forEach(note => { note.hand = note.pitch < 60 ? 'left' : 'right'; });
    return 'pitch-short';
  }
  const chosen = [...hands];
  const pitches = part.notes.map(note => note.pitch);
  const spread = Math.max(...pitches) - Math.min(...pitches);
  const polyphonic = part.notes.some((note, i) => i > 0 &&
    note.start === part.notes[i - 1].start && note.pitch !== part.notes[i - 1].pitch);
  let fallback = false;
  if (new Set(chosen).size === 1 && polyphonic && spread >= 14) {
    fallback = true;
    const sorted = [...pitches].sort((a, b) => a - b);
    const cutoff = Math.max(55, Math.min(67, (sorted[0] + sorted.at(-1)) / 2));
    for (let i = 0; i < chosen.length; i++) chosen[i] = pitches[i] < cutoff ? 'left' : 'right';
  }
  if (inputType !== 'mp3' && explicit && explicitSides.size === 2) {
    const disagreements = chosen.filter((hand, i) => hand !== part.notes[i].hand).length;
    if (disagreements > chosen.length * 0.35) return 'existing-hands';
  }
  part.notes.forEach((note, i) => { note.hand = chosen[i]; });
  return fallback ? 'pitch-fallback' : 'pm2s';
}

function pianoOnlyVersion(version, part) {
  return {...version, instrument:'piano', parts:[part], notes:part.notes};
}

function replacePianoPart(fullXml, annotatedXml, index) {
  const pattern = new RegExp(`<part id="P${index + 1}">[\\s\\S]*?<\\/part>`);
  const body = annotatedXml.match(pattern)?.[0];
  const isolatedBody = body || annotatedXml.match(/<part id="P1">[\s\S]*?<\/part>/)?.[0];
  if (!isolatedBody || !pattern.test(fullXml)) throw new Error('PianoPlayer 乐谱声部无法合并。');
  return fullXml.replace(pattern, isolatedBody.replace('<part id="P1">', `<part id="P${index + 1}">`));
}

async function enhancePianoVersion(version, inputType) {
  const part = (version.parts || []).find(item => item.instrument === 'piano');
  if (!part?.notes.length) return { musicxml:versionToMusicXML(version), version };
  const runtime = findRuntime();
  if (!runtime) {
    version.pianoProcessing = {handMethod:version.mp3PianoAccompaniment?'mp3-arrangement':'pitch', fingeringCount:0,
      warning:version.mp3PianoAccompaniment?'尚未安装 PianoPlayer，左手自动编配仍可演奏，但暂不显示指法。请双击「安装钢琴分手与指法.cmd」。':
        '尚未安装钢琴分手与指法模型；请双击「安装钢琴分手与指法.cmd」。当前仍按音高分谱。'};
    return {musicxml:versionToMusicXML(version), version};
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scoresprout-piano-'));
  try {
    const input = path.join(temp, 'notes.json'), output = path.join(temp, 'hands.json');
    fs.writeFileSync(input, JSON.stringify({bpm:version.bpm, ppq:version.ppq, notes:part.notes}), 'utf8');
    let handMethod, handWarning='';
    if(version.mp3PianoAccompaniment)handMethod='mp3-arrangement';
    else {
      try {
        await runPython(runtime.python, ['hands', input, runtime.weights, output]);
        const result = JSON.parse(fs.readFileSync(output, 'utf8'));
        handMethod = applyHandResults(part, result.hands, inputType);
      } catch (error) {
        handMethod='pitch';
        handWarning=`PM2S 分手失败，已按音高分谱：${error.message}`;
        part.notes.forEach(note => { note.hand=note.hand||(note.pitch<60?'left':'right'); });
      }
    }
    const xml = versionToMusicXML(version);
    const scorePath = path.join(temp, 'score.xml'), annotatedPath = path.join(temp, 'annotated.xml');
    const statsPath = path.join(temp, 'fingering.json');
    const isolatedXml = version.parts.length === 1 ? xml : versionToMusicXML(pianoOnlyVersion(version, part));
    fs.writeFileSync(scorePath, isolatedXml, 'utf8');
    try {
      await runPython(runtime.python, ['fingering', scorePath, annotatedPath, statsPath], 300000);
      const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
      version.pianoProcessing = {handMethod, fingeringCount:stats.fingeringCount,
        ...(handWarning?{warning:handWarning}:{})};
      const annotated = fs.readFileSync(annotatedPath, 'utf8');
      return {musicxml:version.parts.length === 1 ? annotated : replacePianoPart(xml, annotated, version.parts.indexOf(part)), version};
    } catch (error) {
      version.pianoProcessing = {handMethod, fingeringCount:0,
        warning:`${handWarning ? handWarning+'；' : ''}PianoPlayer 指法生成失败：${error.message}`};
      return {musicxml:xml, version};
    }
  } finally {
    fs.rmSync(temp, {recursive:true, force:true});
  }
}

function renameMusicXML(xml, version) {
  const escape = value => String(value).replace(/[<>&"']/g, c =>
    ({'<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;'})[c]);
  const difficulty = {beginner:'新手版', intermediate:'进阶版', full:'完整版'}[version.difficulty];
  return xml.replace(/<work-title>[\s\S]*?<\/work-title>/,
    `<work-title>${escape(version.title)}</work-title>`)
    .replace(/<movement-title>[\s\S]*?<\/movement-title>/,
      `<movement-title>${escape(version.title)} · ${difficulty}</movement-title>`);
}

module.exports = {enhancePianoVersion, renameMusicXML, applyHandResults, findRuntime};
