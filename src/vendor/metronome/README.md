# ScoreSprout metronome view

Built from @pepperhorn/react-music-tools 0.1.0 (MIT), with React/ReactDOM.
Source: https://github.com/pepperhorn/crf-react-music-tools

Rebuild: pnpm build:metronome

Only the presentational Metronome component is mounted. ScorePlayer supplies beat/phase, meter, accents and tempo. Independent engine controls are hidden. Dots are a scoped CSS presentation of the original beat tiles; columns retain the upstream ball/height/color display.
