// Decode MP3 with Chromium, then pass mono PCM to the local model worker.
const TRANSCRIBE_SAMPLE_RATE = 22050;

async function resampleAudio(audioBuffer) {
  if (!audioBuffer.sampleRate || !audioBuffer.numberOfChannels || !audioBuffer.length)
    throw new Error('音频没有可转写的声音。');
  const sourceRate = audioBuffer.sampleRate;
  const mono = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < mono.length; i++) mono[i] += data[i] / audioBuffer.numberOfChannels;
  }
  const length = Math.floor(mono.length * TRANSCRIBE_SAMPLE_RATE / sourceRate);
  const samples = new Float32Array(length);
  // A windowed-sinc low-pass is required before downsampling. Browser offline
  // rendering can alias a 15 kHz tone into the audible range at 22.05 kHz.
  const radius = sourceRate > TRANSCRIBE_SAMPLE_RATE ? 32 : 12;
  const cutoff = Math.min(1, TRANSCRIBE_SAMPLE_RATE / sourceRate) *
    (sourceRate > TRANSCRIBE_SAMPLE_RATE ? .8 : .95);
  const phases = 256, taps = radius * 2 + 1;
  const filters = Array.from({length:phases}, (_, phase) => {
    const kernel = new Float32Array(taps);
    const fraction = phase / phases;
    let sum = 0;
    for (let tap = 0; tap < taps; tap++) {
      const distance = tap - radius - fraction;
      const normalized = distance / radius;
      const window = .42 + .5 * Math.cos(Math.PI * normalized) +
        .08 * Math.cos(2 * Math.PI * normalized);
      const x = Math.PI * cutoff * distance;
      kernel[tap] = (Math.abs(x) < 1e-9 ? cutoff : cutoff * Math.sin(x) / x) * window;
      sum += kernel[tap];
    }
    for (let tap = 0; tap < taps; tap++) kernel[tap] /= sum;
    return kernel;
  });
  const ratio = sourceRate / TRANSCRIBE_SAMPLE_RATE;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const position = i * ratio;
    const center = Math.floor(position);
    const phase = Math.min(phases - 1, Math.round((position - center) * phases));
    const kernel = filters[phase];
    let value = 0;
    for (let tap = 0; tap < taps; tap++) {
      const index = center + tap - radius;
      if (index >= 0 && index < mono.length) value += mono[index] * kernel[tap];
    }
    samples[i] = value;
    peak = Math.max(peak, Math.abs(samples[i]));
    if (i && i % 131072 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (peak < .0005) throw new Error('音频几乎没有可听声音，无法转写。');
  const gain = Math.min(8, .8 / peak);
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}

async function decodeMp3(bytes) {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context) throw new Error('此环境无法解码 MP3 音频。');
  const context = new Context();
  try {
    const raw = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    let audio;
    try { audio = await context.decodeAudioData(raw.slice().buffer); }
    catch { throw new Error('MP3 无法解码，请确认文件未损坏且确实是 MP3 格式。'); }
    if (audio.duration > 600) throw new Error('当前版本最多转写 10 分钟音频。请先裁剪 MP3。');
    return await resampleAudio(audio);
  } finally { await context.close(); }
}

const ScoreTranscriber = {decodeMp3, resampleAudio};
if (typeof module !== 'undefined') module.exports = ScoreTranscriber;
if (typeof window !== 'undefined') window.ScoreTranscriber = ScoreTranscriber;
