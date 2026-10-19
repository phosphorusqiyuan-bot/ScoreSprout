# ScoreSprout

[简体中文](#简体中文) · [English](#english)

## 简体中文

ScoreSprout 是一款优先面向 Windows 的本地乐谱桌面软件。导入 `.mid` / `.midi` 后，可选择一条或多条真实存在的轨道及难度，查看五线谱、试听生成版本，并在本机音乐库保存或导出 MusicXML / MIDI。同乐器轨道合并为一个声部；不同乐器轨道生成合奏谱。钢琴谱可使用 PM2S 分配左右手，再用 PianoPlayer 添加指法。MP3 使用 SheetSage2 提取人声旋律、器乐旋律、和弦与节拍：单旋律可按预测和弦自动编配左手，两条旋律可分别分配到左右手，也可生成吉他、贝斯、鼓练习编配。

## 安装与启动

需要 Windows 10/11、Node.js 22 或更新版本，以及 pnpm 11。MIDI 功能仅需安装 Node 依赖。MP3 功能还需**单独双击 [`安装 SheetSage2.cmd`](安装%20SheetSage2.cmd)**：脚本在项目的 `.sheetsage2-runtime/` 内安装 Python 3.11、CUDA 版 PyTorch 和模型。首次下载约数 GB，建议预留至少 15 GB 磁盘空间；完成后可离线转写。脚本不会把 MP3 上传至模型服务。无需另外安装系统 Python 或 FFmpeg；没有 NVIDIA 显卡时会尝试 CPU，但会慢得多。

要生成钢琴左右手与指法，请再双击 [`安装钢琴分手与指法.cmd`](安装钢琴分手与指法.cmd)。它从 [PM2S 官方模型存档](https://zenodo.org/records/10520196) 下载约 40 MB 的左右手权重，校验 MD5，并安装 PianoPlayer 3.0.2。已有 SheetSage2 时复用其 Python 环境；只有 MIDI 时会在 `.piano-runtime/` 单独安装 CPU 版 PyTorch。安装后可离线使用。未安装时钢琴谱仍可生成，但按音高分谱且不显示指法；结果区会提示。

**快捷启动：**下载项目后，双击根目录的 [`启动 ScoreSprout.cmd`](启动%20ScoreSprout.cmd)。首次运行会自动安装依赖，之后双击即可直接打开应用。Node.js / pnpm 尚未安装时，启动窗口会提示安装。

为兼容本机受限的图形环境，快捷启动使用 `--disable-gpu --no-sandbox`。若系统可正常启动 Electron，也可运行下方的 `pnpm start`，保留 Chromium 沙箱。

在项目目录打开 PowerShell：

```powershell
corepack enable
corepack pnpm install --store-dir .pnpm-store
corepack pnpm start
```

如果已安装 pnpm，可以直接运行 `pnpm install --store-dir .pnpm-store` 和 `pnpm start`。本项目是可直接运行的 Electron 桌面应用；第一版暂未制作 Windows 安装包。

想找 MIDI 文件可访问 [MidiShow](https://www.midishow.com/)、[BitMidi](https://bitmidi.com/)、[FreeMIDI](https://freemidi.org/) 或 [VGMusic](https://www.vgmusic.com/)。请下载 `.mid` / `.midi` 文件后再导入，并遵守各站及作品的使用条款。应用不从这些网站直接抓取文件；VSQX 等声库工程文件暂不支持导入。

## 使用

1. 点击「导入 MIDI 文件」，或先完成模型安装后点击「MP3 提取旋律（SheetSage2）」。文件会复制到本地音乐库，原文件不会被修改。MP3 导入完成后可直接点击「导出转写 MIDI」。
2. 查看速度、拍号、调号和轨道列表，修改歌曲名。MIDI 可勾选多条有音符的轨道、试听并手动指定未识别的乐器。MP3 会显示有音符的人声、器乐旋律轨道；分别试听后可勾选一条或两条，并在「生成乐器」中选择钢琴、吉他、贝斯或鼓。轨道预览统一使用钢琴音色。
3. 选择「新手版」「进阶版」或「完整版」，点击「生成乐谱」。选择的 MIDI 钢琴轨道会先合并成一组音符，再由 PM2S 预测左右手，PianoPlayer 给 MusicXML 标注指法；太短的曲目使用音高回退。MP3 只选一条旋律时，右手保留该旋律，左手按预测和弦及节拍编配：新手版以单根音为主，进阶版加入双音，完整版加入三和弦。选两条旋律时仍分别放入左右手。若缺少覆盖旋律的可用和弦，会明确提示并只生成右手。吉他使用所选旋律与预测和弦，贝斯使用预测和弦根音，鼓使用预测节拍。结果区会标明这些是练习编配，不是原曲真实分轨。MIDI 已识别的乐器轨道不能冒充另一种乐器。
4. 在结果区域播放、暂停、停止或拖动进度。播放时谱面上的竖线跟随当前音符，拖动进度后也会跳到对应位置。延音踏板保持的音会延长到踏板释放或同音再次触发；MusicXML 谱面、试听和导出 MIDI 都由同一份生成音符数据产生。
5. 从左侧本地音乐库重开版本，或按歌曲、乐器、难度筛选。再次选择难度并生成会保存为另一版本；同一歌曲的不同乐器使用独立的内部标识。
6. 点击音乐库条目旁的「删除」或结果区的「删除乐谱」，确认后移除此版本。原始 MIDI、其他版本和已导出的文件会保留；当前打开的版本被删除时，播放会停止，仍可重新生成。

音乐库保存在 Electron 的 `userData/library` 目录，Windows 通常是 `%APPDATA%\scoresprout\library`。每首歌保存 `original.mid` 和 `manifest.json`；MP3 歌曲还保存 `original.mp3`。每个生成版本保存 JSON、`.musicxml`、`.mid`。已分配双手的钢琴 MIDI 导出为左右手两轨；指法保存在 MusicXML，标准 MIDI 不承载指法。无需账号或云服务。

## 示例和验证

仓库的 `samples/` 包含钢琴、吉他、贝斯、鼓、四乐器合奏、无速度信息、单轨多乐器，以及分轨钢琴加延音踏板，共 8 个 MIDI。它们可以随时重新生成：

```powershell
corepack pnpm samples
corepack pnpm test
corepack pnpm smoke
node scripts/smoke-sheetsage2.js   # 完成模型安装后，运行真实 SheetSage2 端到端测试
```

`smoke` 会启动真正的 Electron 应用七次：前四次验证 MIDI 生成、导出、播放、删除与重启读取；第五次验证降采样；后两次用真实 MP3 验证解码、钢琴谱渲染、MIDI 导出及重启读取。后两次使用固定 MIDI 夹具替代大型模型，因此不评估 SheetSage2 的音高识别质量。结果和导出文件位于项目下自动创建的 `.smoke-*` 目录。测试音频 `samples/440hz-test.mp3` 来自 [badgerodon/mp3](https://github.com/badgerodon/mp3)（MIT License）。

`smoke-sheetsage2.js` 使用仓库内自行合成的 16 音旋律 MP3 和真实模型，检查音高顺序、四种乐器的谱面、MIDI / MusicXML 导出与重启读取。当前实测输出 17 音，末尾多一个伴奏音；该测试不能代表任意流行歌曲的转写准确率。测试音频可用 `node scripts/generate-sheetsage2-probe.js` 生成 PCM，再执行 `ffmpeg -f f32le -ar 22050 -ac 1 -i .sheetsage2-runtime/probe.f32 -codec:a libmp3lame -q:a 2 samples/sheetsage2-melody.mp3` 重新生成。

## 技术选择

- [Electron](https://www.electronjs.org/docs/latest/)：提供 Windows 桌面窗口、本地文件对话框和离线存储。
- [midi-file](https://github.com/carter-thaxton/midi-file)：读写标准 MIDI 事件；按轨道、通道与 Program Change 拆分音符。
- [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay)：把生成的 MusicXML 在应用内渲染为五线谱。
- Web Audio API：本地合成钢琴、拨弦吉他、贝斯与鼓音色，按生成音符调度播放。
- Chromium 解码 MP3；[SheetSage2](https://huggingface.co/m-a-p/SheetSage2) 与其 [MERT-v2-FullSong](https://huggingface.co/m-a-p/MERT-v2-FullSong) 编码器在本机提取人声和器乐旋律。模型权重采用 CC BY-NC 4.0，仅适合符合该许可的非商业用途；模型代码由 Hugging Face 在本地执行，安装时应信任官方仓库。音频不会上传。
- [PM2S](https://github.com/cheriell/PM2S) 的手部分配网络及官方权重用于钢琴音符的左右手预测；改编的模型结构代码按 MIT 许可保留在 `scripts/pm2s_hand_model.py`，权重来自 Zenodo，采用 CC BY 4.0。只使用分手模型，不使用它的节奏重写。[PianoPlayer](https://github.com/marcomusy/pianoplayer)（MIT）只在分手后的 MusicXML 上标注指法；输出须通过音符一致性检查才会保存。

应用主进程负责本地文件访问；渲染进程通过受限的 preload API 与主进程通信。导入和生成不向外部服务发送数据。

### 左手自动伴奏项目调研

- [AccoMontage2](https://github.com/billyblu2000/accomontage2)（MIT）能从旋律 MIDI 自动生成和弦与钢琴伴奏，不依赖语言模型。但其示例接口仍要求提供调性、乐句分段，目前只支持 4/4，运行还需额外数据文件和依赖；不适合作为当前 Windows 桌面版的直接替换。
- [AccoMontage](https://github.com/zhaojw1998/AccoMontage)（MIT）结合规则优化与学习式风格迁移，需要检查点和伴奏素材，适合后续研究，不是轻量的纯规则左手生成器。
- [MidiGen](https://github.com/cainky/midigen) 提供确定性的和弦连接与琶音组件，无大型模型，但需要先有和弦进行，且为 AGPL-3.0。当前项目未复制或依赖其代码。

目前没有发现能直接接入、同时满足「仅输入单旋律、全自动、轻量、纯规则」的成熟项目。ScoreSprout 继续用本地可复现的和弦与节拍规则编配左手；后续改善重点是和弦准确率、和弦转位与声部连接，输出始终标注为自动编配。

## 第一版的明确限制

- MIDI 生成谱使用文件开头的速度和拍号；多次速度或拍号变化会提示。没有速度信息时用 120 BPM。MP3 在有足够节拍数据时估计记谱速度，原始转写 MIDI 仍保留模型的时间基准。
- 完整版将保留的音符量化到六十四分音符，进阶版为三十二分音符，新手版为十六分音符；简化主要通过减少音符和和弦密度完成。复杂连音、摇摆节奏、踏板标记、表情与力度细节尚不能完整记谱。延音踏板会延长音符时值，但谱面不显示踏板符号；量化仍可能造成小幅时间偏差。
- 简化是可重复的规则处理，不保证所有曲目仍有理想的音乐表现。吉他使用高音谱表，暂不生成六线谱或指法；鼓谱支持常见鼓组映射，罕见打击乐音高可能使用通用位置。
- 试听采用轻量合成音色，并非高采样率 SoundFont；音符与谱一致，但与专业音源的质感不同。
- 暂不导出 PDF，也未制作安装包。可将 MusicXML 交给 MuseScore 等工具继续编辑或导出 PDF。
- 只处理标准 PPQ MIDI。SMPTE 时间格式暂不支持；极长或非常复杂的文件可能需要人工整理。
- SheetSage2 的人声与器乐结果是两条候选旋律，并非分离的音轨或完整伴奏。MP3 双旋律钢琴谱把第二条旋律移入左手音域，必要时移八度；单旋律钢琴谱依据预测和弦及节拍**自动编配**左手。二者都不等于原曲钢琴左手转写。缺少可用和弦时单旋律仍只有右手。PM2S 只用于给现有钢琴音符分手，自动编配的左右手固定不再交由 PM2S 改写。模型可能错分跨手或复杂和弦，短曲和失衡结果会回退。PianoPlayer 的指法是演奏建议，密集和弦或长音连结处可能无法给每个音都标指法。
- MP3 的吉他、贝斯、鼓谱是按预测旋律、和弦与节拍生成的练习编配，**不是原曲吉他、贝斯或鼓的转写**；缺少可用和弦时不能生成贝斯谱，缺少节拍时不能生成鼓谱。模型错认和弦或节拍会影响编配。复杂混音、强伴奏或混响仍可能导致错音和漏音，实际曲目请逐条试听。转写 MIDI 使用模型给出的音符时间，谱面仍由 ScoreSprout 量化；最多处理 25 MB、10 分钟。模型一次按最长 5 分钟窗口分析，长音频、CPU 或显存较小的显卡可能耗时很长或内存不足。旧版 MP3 导入项没有保存和弦与节拍，可重新导入原 MP3 创建新版曲目。
- 网易云音乐、B 站等链接导入和更准确的多乐器音频识别属于后续扩展方向，当前不接入。

## English

ScoreSprout is a local desktop app, built with Windows in mind, that turns MIDI tracks into sheet music at a level you can play. Import a `.mid` or `.midi` file, choose one or more tracks and a difficulty, then read and play the generated score. Tracks of the same instrument merge into one part; tracks of different instruments form an ensemble score. Piano scores can use PM2S for hand assignment and PianoPlayer for fingering. MP3 transcription uses SheetSage2 to predict vocal and instrumental melodies, chords, and beats. A single melody can receive an automatically arranged left hand from predicted chords; two melodies can be split across the grand staff. Guitar, bass, and drum practice arrangements are also available.

### Install and run

Requires Windows 10/11, Node.js 22 or newer, and pnpm 11. For MP3 transcription, double-click [`安装 SheetSage2.cmd`](安装%20SheetSage2.cmd) once. It installs an isolated Python 3.11 runtime, CUDA PyTorch and model files in `.sheetsage2-runtime/`; allow at least 15 GB of free space and several GB of downloads. Later transcription works offline. A separate system Python or FFmpeg is unnecessary. CPU fallback may be very slow. In PowerShell, from the project directory:

For piano hand assignment and fingering, also double-click [`安装钢琴分手与指法.cmd`](安装钢琴分手与指法.cmd). It verifies and installs the official 40 MB PM2S hand model and PianoPlayer 3.0.2. It reuses the SheetSage2 Python runtime when available; MIDI-only users get a separate CPU runtime in `.piano-runtime/`. Without this optional install, piano scores remain playable but use a pitch split and have no fingering.

**Quick launch:** double-click [`启动 ScoreSprout.cmd`](启动%20ScoreSprout.cmd) in the project root. It installs dependencies on the first run, then opens the app directly on later runs. If Node.js or pnpm is missing, the launcher displays an installation hint.

For compatibility with restricted graphics environments, the quick launcher uses `--disable-gpu --no-sandbox`. On systems where Electron starts normally, use `pnpm start` to retain the Chromium sandbox.

```powershell
corepack enable
corepack pnpm install --store-dir .pnpm-store
corepack pnpm start
```

If pnpm is already installed, use `pnpm install --store-dir .pnpm-store` and `pnpm start`. This is a runnable Electron application; a Windows installer is not included in the first release.

You can find MIDI files at [MidiShow](https://www.midishow.com/), [BitMidi](https://bitmidi.com/), [FreeMIDI](https://freemidi.org/), and [VGMusic](https://www.vgmusic.com/). Download a `.mid` or `.midi` file and import it into ScoreSprout, following each site's and work's terms. The app does not fetch files from those sites. VSQX and other vocal-synth project formats are not supported.

### Use

1. Click **导入 MIDI 文件** (Import MIDI file) or **MP3 提取旋律（SheetSage2）** after model setup. The app copies the file to its local library without changing the original. For an MP3, **导出转写 MIDI** exports the raw transcription immediately.
2. Review the tempo, time signature, key signature, and tracks. Edit the song title if needed. MIDI tracks can be previewed, selected together, and assigned an instrument when unidentified. MP3 results show vocal and instrumental melody tracks when notes are present. Preview and select one or both, then choose an output instrument. Track previews use piano sound.
3. Choose **新手版** (Beginner), **进阶版** (Intermediate), or **完整版** (Full), then click **生成乐谱** (Generate score). Selected MIDI piano notes are combined before PM2S assigns hands; PianoPlayer annotates the resulting MusicXML. Very short passages fall back to a pitch split. For a single MP3 melody, the right hand keeps the melody and the left hand is arranged from predicted chords and beats; Beginner favors single bass notes, Intermediate adds dyads, and Full adds triads. With two selected melodies, each takes one hand. If no usable chords cover the melody, the app explains why it keeps only the right hand. Guitar combines a selected melody with predicted chords; bass uses chord roots; drums use predicted beats. These are practice arrangements, not transcriptions of the source instruments. A recognized MIDI instrument track cannot be relabeled as another instrument.
4. Play, pause, stop, or seek through the result. A vertical cursor follows the current note and moves when seeking. Sustain pedal events extend notes until pedal release or a repeated note. The score, playback, and exported MIDI are derived from the same generated note data.
5. Reopen saved versions from the local library, or filter by song, instrument, and difficulty. Generate another difficulty to save another version. Different instruments of the same song have separate internal IDs.
6. Click **删除** (Delete) beside a library entry or **删除乐谱** (Delete score) in the result panel, then confirm. Only that version is removed; the original MIDI, other versions, and exported files are kept. Deleting the open version stops playback, and you can generate it again from the retained source.

The library lives in Electron's `userData/library` directory, usually `%APPDATA%\scoresprout\library` on Windows. Each song stores `original.mid` and `manifest.json`; MP3 imports also store `original.mp3`. Each arrangement stores JSON, `.musicxml`, and `.mid` files. No account or cloud service is required.

When both hands have notes, piano MIDI exports contain separate right- and left-hand tracks. Fingering is stored in MusicXML; standard MIDI does not encode it.

### Samples and verification

The `samples/` directory contains eight MIDI files: piano, guitar, bass, drums, a four-instrument ensemble, a file without tempo data, a mixed-instrument single track, and a split piano with sustain pedal. Regenerate the samples and run the checks with:

```powershell
corepack pnpm samples
corepack pnpm test
corepack pnpm smoke
node scripts/smoke-sheetsage2.js   # After model setup, run the real SheetSage2 end-to-end test.
```

The smoke test launches Electron for MIDI generation, rendering, export, playback, deletion, and audio resampling. It also decodes a real MP3 and tests score creation, MIDI export, and persistence with a fixed MIDI fixture in place of the large model. It does not measure SheetSage2 accuracy. Outputs are written to a `.smoke-*` directory. The 440 Hz MP3 comes from [badgerodon/mp3](https://github.com/badgerodon/mp3) (MIT License).

`smoke-sheetsage2.js` uses a self-generated 16-note melody MP3 and the actual model to check note order, all four instrument scores, MIDI / MusicXML export, and reopening after restart. The current result has 17 notes, with one extra accompaniment note at the end. This synthetic probe does not establish accuracy on arbitrary songs. Recreate it with `node scripts/generate-sheetsage2-probe.js`, then `ffmpeg -f f32le -ar 22050 -ac 1 -i .sheetsage2-runtime/probe.f32 -codec:a libmp3lame -q:a 2 samples/sheetsage2-melody.mp3`.

### Technology

- [Electron](https://www.electronjs.org/docs/latest/) provides the desktop window, file dialogs, and local storage.
- [midi-file](https://github.com/carter-thaxton/midi-file) reads and writes standard MIDI events. Notes are separated by track, channel, and Program Change.
- [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) renders generated MusicXML as staff notation inside the app.
- The Web Audio API synthesizes piano, plucked guitar, bass, and drum sounds locally from the generated notes.
- Chromium decodes MP3 locally. [SheetSage2](https://huggingface.co/m-a-p/SheetSage2) and its [MERT-v2-FullSong](https://huggingface.co/m-a-p/MERT-v2-FullSong) encoder extract separate vocal and instrumental melodies locally. Their weights use CC BY-NC 4.0, so use must comply with the noncommercial license. Setup downloads and executes code from the official Hugging Face model repository. Audio stays on the device.
- [PM2S](https://github.com/cheriell/PM2S) hand-part weights predict piano hands. The adapted network architecture in `scripts/pm2s_hand_model.py` retains its MIT attribution; official weights are CC BY 4.0. PM2S's timing rewrite is not used. [PianoPlayer](https://github.com/marcomusy/pianoplayer) (MIT) annotates the hand-split MusicXML, which is accepted only if the musical notes are unchanged.

The main process handles local file access; the renderer communicates through a restricted preload API. Importing and generating do not send song data to an external service.

### Research on automatic left-hand accompaniment

- [AccoMontage2](https://github.com/billyblu2000/accomontage2) (MIT) generates chords and piano accompaniment from melody MIDI without a language model. Its example API still needs a key and phrase segmentation, currently supports only 4/4, and requires additional data and dependencies. It is not a drop-in replacement for the Windows desktop app.
- [AccoMontage](https://github.com/zhaojw1998/AccoMontage) (MIT) combines rule-based optimization with learned style transfer and needs checkpoints and accompaniment material.
- [MidiGen](https://github.com/cainky/midigen) has deterministic voice-leading and arpeggio components without a large model, but needs a supplied chord progression and is AGPL-3.0. ScoreSprout does not copy or depend on its code.

We did not find a mature drop-in project that takes only a melody and is fully automatic, lightweight, and purely rule based. ScoreSprout keeps its local deterministic chord-and-beat accompaniment; future improvements should target chord accuracy, inversion choice, and smoother voice leading. The output remains labeled as an arrangement.

### Known limits of the first release

- MIDI scores use the initial tempo and time signature; later changes produce a warning. Missing tempo defaults to 120 BPM. MP3 scores estimate notation tempo when enough beats are available, while the raw transcription MIDI keeps its model time base.
- Full quantizes retained notes to sixty-fourth notes, Intermediate to thirty-second notes, and Beginner to sixteenth notes. Simplification reduces note and chord density without pulling retained notes to whole-beat boundaries. Tuplets, swing, pedal markings, expression, and fine velocity details are not fully represented. Sustain pedal events extend note lengths, but pedal symbols are not shown. Quantization can still cause small timing differences.
- Simplification is deterministic and may need manual musical editing. Guitar uses a treble staff, without tablature or fingering. Drum notation maps common kit sounds; unusual percussion may use a generic position.
- Playback uses lightweight synthesized sounds rather than a high-quality SoundFont. The notes match the score, but the timbre differs from a professional instrument library.
- PDF export and a packaged installer are not included. Open the MusicXML in MuseScore or another notation editor to refine it or export a PDF.
- Only standard PPQ MIDI is supported. SMPTE timing is not supported, and very long or complex files may need manual cleanup.
- SheetSage2's vocal and instrumental outputs are melody candidates, not separated stems or full accompaniment. With two MP3 melodies, the second is shifted into the left-hand range, sometimes by an octave. With one melody, the left hand is **automatically arranged** from predicted chords and beats. Neither output is a transcription of the recording's original left hand. Without usable chords, the single melody remains right-hand only. PM2S assigns existing MIDI piano notes to hands; it does not rewrite the hands of the generated MP3 accompaniment. Hand crossings and complex chords can be misclassified, so short or imbalanced passages may fall back. PianoPlayer's fingering is a suggestion and may omit some chord or tied notes.
- MP3 guitar, bass, and drum scores are practice arrangements from predicted melody, chords, and beats, **not transcriptions of the recording's individual instruments**. Bass needs recognizable chords; drums need recognizable beats. Prediction errors affect these arrangements. Strong accompaniment or reverb can cause wrong or missing notes; preview both tracks. MIDI retains the model's note timing; ScoreSprout quantizes the score. MP3 input is limited to 25 MB and 10 minutes. Long files, CPU inference, or small GPUs may be very slow or run out of memory. Older MP3 library entries lack saved chord and beat data; reimport the original MP3 to create a current entry.
- Importing links from NetEase Cloud Music, Bilibili, or other sites, and more accurate multi-instrument audio recognition, remain future extensions.
