# ScoreSprout

[简体中文](#简体中文) · [English](#english)

## 简体中文

ScoreSprout 是一款优先面向 Windows 的本地 MIDI 乐谱桌面软件。导入 `.mid` / `.midi` 后，可选择一条或多条真实存在的轨道及难度，查看五线谱、试听生成版本，并在本机音乐库保存或导出 MusicXML / MIDI。同乐器轨道合并为一个声部；不同乐器轨道生成合奏谱。

## 安装与启动

需要 Windows 10/11、Node.js 22 或更新版本，以及 pnpm 11。首次安装需要联网下载依赖和 Electron，之后处理歌曲不需要网络。

**快捷启动：**下载项目后，双击根目录的 [`启动 ScoreSprout.cmd`](启动%20ScoreSprout.cmd)。首次运行会自动安装依赖，之后双击即可直接打开应用。Node.js / pnpm 尚未安装时，启动窗口会提示安装。

为兼容本机受限的图形环境，快捷启动使用 `--disable-gpu --no-sandbox`。若系统可正常启动 Electron，也可运行下方的 `pnpm start`，保留 Chromium 沙箱。

在项目目录打开 PowerShell：

```powershell
corepack enable
corepack pnpm install
corepack pnpm start
```

如果已安装 pnpm，可以直接运行 `pnpm install` 和 `pnpm start`。本项目是可直接运行的 Electron 桌面应用；第一版暂未制作 Windows 安装包。

想找 MIDI 文件可访问 [MidiShow](https://www.midishow.com/)、[BitMidi](https://bitmidi.com/)、[FreeMIDI](https://freemidi.org/) 或 [VGMusic](https://www.vgmusic.com/)。请下载 `.mid` / `.midi` 文件后再导入，并遵守各站及作品的使用条款。应用不从这些网站直接抓取文件；VSQX 等声库工程文件暂不支持导入。

## 使用

1. 点击「导入 MIDI 文件」。文件会复制到本地音乐库，原文件不会被修改。
2. 查看速度、拍号、调号和轨道列表，修改歌曲名。勾选一条或多条有音符的轨道；每条轨道都可单独试听，未识别的轨道需手动指定乐器。
3. 选择「新手版」「进阶版」或「完整版」，点击「生成乐谱」。已识别的乐器轨道不能冒充另一种乐器。
4. 在结果区域播放、暂停、停止或拖动进度。延音踏板保持的音会延长到踏板释放或同音再次触发；MusicXML 谱面、试听和导出 MIDI 都由同一份生成音符数据产生。
5. 从左侧本地音乐库重开版本，或按歌曲、乐器、难度筛选。再次选择难度并生成会保存为另一版本；同一歌曲的不同乐器使用独立的内部标识。

音乐库保存在 Electron 的 `userData/library` 目录，Windows 通常是 `%APPDATA%\scoresprout\library`。每首歌保存 `original.mid` 和 `manifest.json`；每个生成版本保存 JSON、`.musicxml`、`.mid`。无需账号或云服务。

## 示例和验证

仓库的 `samples/` 包含钢琴、吉他、贝斯、鼓、四乐器合奏、无速度信息、单轨多乐器，以及分轨钢琴加延音踏板，共 8 个 MIDI。它们可以随时重新生成：

```powershell
corepack pnpm samples
corepack pnpm test
corepack pnpm smoke
```

`smoke` 会启动真正的 Electron 应用两次：首次导入四乐器示例，为每种乐器生成三档谱，并生成一份多轨合奏谱，逐一渲染、导出；第二次检查音乐库持久化、合奏重开及播放、暂停、停止、进度跳转。结果和导出文件位于项目下自动创建的 `.smoke-*` 目录。

## 技术选择

- [Electron](https://www.electronjs.org/docs/latest/)：提供 Windows 桌面窗口、本地文件对话框和离线存储。
- [midi-file](https://github.com/carter-thaxton/midi-file)：读写标准 MIDI 事件；按轨道、通道与 Program Change 拆分音符。
- [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay)：把生成的 MusicXML 在应用内渲染为五线谱。
- Web Audio API：本地合成钢琴、拨弦吉他、贝斯与鼓音色，按生成音符调度播放。

应用主进程负责本地文件访问；渲染进程通过受限的 preload API 与主进程通信。导入和生成不向外部服务发送数据。

## 第一版的明确限制

- 生成谱统一使用文件开头的速度和拍号；多次速度或拍号变化会提示。没有速度信息时用 120 BPM。
- 节奏量化到十六分音符（完整版）、八分音符（进阶版）或四分音符（新手版）；复杂连音、摇摆节奏、踏板标记、表情与力度细节尚不能完整记谱。延音踏板会延长音符时值，但谱面不显示踏板符号。完整版仍可能因量化而与原 MIDI 的微小时间偏差不同。
- 简化是可重复的规则处理，不保证所有曲目仍有理想的音乐表现。吉他使用高音谱表，暂不生成六线谱或指法；鼓谱支持常见鼓组映射，罕见打击乐音高可能使用通用位置。
- 试听采用轻量合成音色，并非高采样率 SoundFont；音符与谱一致，但与专业音源的质感不同。
- 暂不导出 PDF，也未制作安装包。可将 MusicXML 交给 MuseScore 等工具继续编辑或导出 PDF。
- 只处理标准 PPQ MIDI。SMPTE 时间格式暂不支持；极长或非常复杂的文件可能需要人工整理。
- 网易云音乐、B 站等链接导入及音频识别属于后续扩展方向，第一版不接入。

## English

ScoreSprout is a local desktop app, built with Windows in mind, that turns MIDI tracks into sheet music at a level you can play. Import a `.mid` or `.midi` file, choose one or more tracks and a difficulty, then read and play the generated score. Tracks of the same instrument merge into one part; tracks of different instruments form an ensemble score. Save it in the local library or export MusicXML and MIDI.

### Install and run

Requires Windows 10/11, Node.js 22 or newer, and pnpm 11. The first installation downloads dependencies and Electron; importing and arranging music works offline afterward. In PowerShell, from the project directory:

**Quick launch:** double-click [`启动 ScoreSprout.cmd`](启动%20ScoreSprout.cmd) in the project root. It installs dependencies on the first run, then opens the app directly on later runs. If Node.js or pnpm is missing, the launcher displays an installation hint.

For compatibility with restricted graphics environments, the quick launcher uses `--disable-gpu --no-sandbox`. On systems where Electron starts normally, use `pnpm start` to retain the Chromium sandbox.

```powershell
corepack enable
corepack pnpm install
corepack pnpm start
```

If pnpm is already installed, use `pnpm install` and `pnpm start`. This is a runnable Electron application; a Windows installer is not included in the first release.

You can find MIDI files at [MidiShow](https://www.midishow.com/), [BitMidi](https://bitmidi.com/), [FreeMIDI](https://freemidi.org/), and [VGMusic](https://www.vgmusic.com/). Download a `.mid` or `.midi` file and import it into ScoreSprout, following each site's and work's terms. The app does not fetch files from those sites. VSQX and other vocal-synth project formats are not supported.

### Use

1. Click **导入 MIDI 文件** (Import MIDI file). The app copies the file to its local library without changing the original.
2. Review the tempo, time signature, key signature, and tracks. Edit the song title if needed. Select one or more tracks with notes. Each track has its own preview; assign the instrument of any unidentified track manually.
3. Choose **新手版** (Beginner), **进阶版** (Intermediate), or **完整版** (Full), then click **生成乐谱** (Generate score). A recognized instrument track cannot be relabeled as another instrument.
4. Play, pause, stop, or seek through the result. Sustain pedal events extend notes until pedal release or a repeated note. The score, playback, and exported MIDI are derived from the same generated note data.
5. Reopen saved versions from the local library, or filter by song, instrument, and difficulty. Generate another difficulty to save another version. Different instruments of the same song have separate internal IDs.

The library lives in Electron's `userData/library` directory, usually `%APPDATA%\scoresprout\library` on Windows. Each song stores `original.mid` and `manifest.json`; each arrangement stores JSON, `.musicxml`, and `.mid` files. No account or cloud service is required.

### Samples and verification

The `samples/` directory contains eight MIDI files: piano, guitar, bass, drums, a four-instrument ensemble, a file without tempo data, a mixed-instrument single track, and a split piano with sustain pedal. Regenerate the samples and run the checks with:

```powershell
corepack pnpm samples
corepack pnpm test
corepack pnpm smoke
```

The smoke test launches the Electron app twice. It imports the ensemble, generates and renders all three difficulty levels for all four instruments plus one multi-track ensemble, and exports them. On the second launch, it checks library persistence, ensemble reopening, and the play, pause, stop, and seek controls. Outputs are written to a `.smoke-*` directory in the project.

### Technology

- [Electron](https://www.electronjs.org/docs/latest/) provides the desktop window, file dialogs, and local storage.
- [midi-file](https://github.com/carter-thaxton/midi-file) reads and writes standard MIDI events. Notes are separated by track, channel, and Program Change.
- [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) renders generated MusicXML as staff notation inside the app.
- The Web Audio API synthesizes piano, plucked guitar, bass, and drum sounds locally from the generated notes.

The main process handles local file access; the renderer communicates through a restricted preload API. Importing and generating do not send song data to an external service.

### Known limits of the first release

- The score uses the tempo and time signature at the beginning of the file. The app warns about later changes and assumes 120 BPM when tempo is missing.
- Rhythm is quantized to sixteenth notes (Full), eighth notes (Intermediate), or quarter notes (Beginner). Tuplets, swing, pedal markings, expression, and fine velocity details are not fully represented. Sustain pedal events extend note lengths, but pedal symbols are not shown on the score. Even the Full version may differ slightly from the original MIDI timing.
- Simplification is deterministic and may need manual musical editing. Guitar uses a treble staff, without tablature or fingering. Drum notation maps common kit sounds; unusual percussion may use a generic position.
- Playback uses lightweight synthesized sounds rather than a high-quality SoundFont. The notes match the score, but the timbre differs from a professional instrument library.
- PDF export and a packaged installer are not included. Open the MusicXML in MuseScore or another notation editor to refine it or export a PDF.
- Only standard PPQ MIDI is supported. SMPTE timing is not supported, and very long or complex files may need manual cleanup.
- Importing links from NetEase Cloud Music, Bilibili, or other sites, and audio recognition, are possible future extensions; they are not part of this release.
