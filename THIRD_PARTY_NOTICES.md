# 第三方组件与素材

ScoreSprout 0.2.0 随源码分发以下第三方内容。项目其余依赖的版本以 `pnpm-lock.yaml` 为准。

## Salamander Grand Piano

- 作者：Alexander Holm
- 原始项目：https://github.com/sfzinstruments/SalamanderGrandPiano
- MP3 分发来源：https://github.com/Tonejs/audio/tree/master/salamander
- 许可证：Creative Commons Attribution 3.0 Unported（CC BY 3.0）
- 本项目位置：`src/assets/piano/`

本项目包含 30 个未修改的 MP3 录音采样，以小三度间隔覆盖 A0–C8。详细署名、文件大小与 SHA-256 见 `src/assets/piano/ATTRIBUTION.md` 和 `src/assets/piano/manifest.json`。

## React Music Tools metronome view

- 软件包：`@pepperhorn/react-music-tools` 0.1.0
- 来源：https://github.com/pepperhorn/crf-react-music-tools
- 许可证：MIT
- 本项目位置：`src/vendor/metronome/`

仓库保存了可重建的 React 入口 `src/metronome-view.jsx`、构建脚本 `scripts/build-metronome.js`、生成文件以及 React、ReactDOM、scheduler 和该组件的完整许可证文本。详见 `src/vendor/metronome/LICENSES.txt`。

## 运行时模型

SheetSage2、MERT、PM2S 和 PianoPlayer 不作为本次源码包内的大型运行时文件分发；安装脚本会按 README 的说明下载。它们的来源和许可证说明见 `README.md`。
