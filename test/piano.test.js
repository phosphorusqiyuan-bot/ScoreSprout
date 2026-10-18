const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { analyzeMidi, generateVersion, versionToMidi } = require('../src/midi');
const { applyHandResults, enhancePianoVersion, findRuntime, renameMusicXML } = require('../src/piano');

test('单旋律 MP3 不凭模型标签创造左手伴奏', () => {
  const notes = Array.from({length:16}, (_, index) => ({pitch:64 + index % 4, start:index * 120, hand:'right'}));
  const method = applyHandResults({notes}, notes.map((_, index) => index % 2 ? 'left' : 'right'), 'mp3');
  assert.equal(method, 'mp3-roles');
  assert(notes.every(note => note.hand === 'right'));
});

test('短曲分手回退不丢失任何音符，重命名保留指法', () => {
  const notes = [{pitch:48}, {pitch:60}, {pitch:67}];
  assert.equal(applyHandResults({notes}, ['right','left','left'], 'midi'), 'pitch-short');
  assert.deepEqual(notes.map(note => note.hand), ['left','right','right']);
  const renamed = renameMusicXML('<work-title>旧名</work-title><movement-title>旧名 · 完整版</movement-title><fingering>3</fingering>',
    {title:'新曲 & <测试>', difficulty:'full'});
  assert.match(renamed, /<work-title>新曲 &amp; &lt;测试&gt;<\/work-title>/);
  assert.match(renamed, /<fingering>3<\/fingering>/);
});

test('真实 PM2S + PianoPlayer：双手、指法和导出保持音符',
  {skip:!findRuntime()}, async () => {
    const file = path.join(__dirname, '..', 'samples', 'piano.mid');
    const source = analyzeMidi(fs.readFileSync(file), 'piano.mid');
    const version = generateVersion(source, [source.tracks[0].id], 'piano', 'full', source.title);
    const before = version.notes.map(note => [note.pitch, note.start, note.duration]);
    const {musicxml} = await enhancePianoVersion(version, 'midi');
    assert.equal(version.pianoProcessing.handMethod, 'pm2s');
    assert(version.notes.some(note => note.hand === 'left'));
    assert(version.notes.some(note => note.hand === 'right'));
    assert(version.pianoProcessing.fingeringCount > 0);
    assert.equal((musicxml.match(/<fingering>/g) || []).length, version.pianoProcessing.fingeringCount);
    assert.deepEqual(version.notes.map(note => [note.pitch, note.start, note.duration]), before);
    const exported = analyzeMidi(versionToMidi(version), 'result.mid');
    assert.equal(exported.tracks.length, 2);
    assert.equal(exported.tracks.reduce((total, track) => total + track.notes.length, 0), version.notes.length);
  });
