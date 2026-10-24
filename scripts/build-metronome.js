const path=require('node:path'),fs=require('node:fs');
const root=path.join(__dirname,'..'),out=path.join(root,'src/vendor/metronome');
require('esbuild').buildSync({entryPoints:[path.join(root,'src/metronome-view.jsx')],
  bundle:true,minify:true,format:'iife',platform:'browser',target:'chrome140',
  define:{'process.env.NODE_ENV':'"production"'},outfile:path.join(out,'view.js'),legalComments:'linked'});
const packages=['@pepperhorn/react-music-tools','react','react-dom','scheduler'];
const license=packages.map(name=>{
  const base=name==='scheduler'?path.dirname(require.resolve('scheduler/package.json',{paths:[path.dirname(require.resolve('react-dom/package.json'))]})):path.dirname(require.resolve(name+'/package.json'));
  return `\n===== ${name} ${JSON.parse(fs.readFileSync(path.join(base,'package.json'))).version} =====\n`+fs.readFileSync(path.join(base,'LICENSE'),'utf8');
}).join('\n');
fs.writeFileSync(path.join(out,'LICENSES.txt'),license);
fs.writeFileSync(path.join(out,'README.md'),'# ScoreSprout metronome view\n\nBuilt from @pepperhorn/react-music-tools 0.1.0 (MIT), with React/ReactDOM.\nSource: https://github.com/pepperhorn/crf-react-music-tools\n\nRebuild: pnpm build:metronome\n\nOnly the presentational Metronome component is mounted. ScorePlayer supplies beat/phase, meter, accents and tempo. Independent engine controls are hidden. Dots are a scoped CSS presentation of the original beat tiles; columns retain the upstream ball/height/color display.\n');
console.log('Built local metronome view and license notices.');
