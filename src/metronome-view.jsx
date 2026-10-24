import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Metronome,DEFAULT_METRONOME_SETTINGS,createTickTimer} from '@pepperhorn/react-music-tools/metronome';
import '@pepperhorn/react-music-tools/styles.css';
import './metronome-view.css';

// Use the package's actual view. ScorePlayer supplies the calibrated baseline; no
// MetronomeEngine is started, so song playback remains the only audio clock.
window.ScoreAudioTicker=()=>createTickTimer();
window.ScoreMetronomeView={mount(host,{transport,info,enabled}){
  const root=createRoot(host);let key='',mounted=false;
  const getBeatState=()=>{
    const p=transport(),s=p?.metronomeState();
    if(!s)return null;
    host.dataset.beat=String(s.beat+1);host.dataset.phase=String(s.phase);
    host.dataset.bpm=String(s.bpm);host.dataset.mode=s.mode;
    const caption=`固定基准 · ${s.signature} · ${s.unitLabel} = ${Math.round(s.bpm*10)/10} · ${s.measure<=0?'首拍前':`基准第 ${s.measure} 小节`} · 第 ${s.beat+1}/${s.accents.length} 拍 · ${p.playing?'播放中':p.position>0?'已暂停':'待播放'}`;
    if(info.textContent!==caption)info.textContent=caption;
    return !p.playing&&p.position===0?null:{beat:s.beat,phase:s.phase};
  };
  return {update(){
    const s=transport()?.metronomeState();
    if(!enabled()||!s){if(mounted){flushSync(()=>root.render(null));mounted=false;key='';}return;}
    getBeatState();
    // The view keeps polling while paused, returning the same frozen position.
    const next=JSON.stringify([s.signature,Math.round(s.bpm*10)/10,s.accents]);
    if(next===key&&mounted)return;
    key=next;mounted=true;
    flushSync(()=>root.render(<Metronome layout="wide" running={true}
      settings={{...DEFAULT_METRONOME_SETTINGS,mode:'simple',signature:s.signature,bpm:Math.round(s.bpm*10)/10,accents:s.accents}}
      getBeatState={getBeatState} onSettingsChange={()=>{}} onStart={()=>{}} onStop={()=>{}} />));
  },dispose(){root.unmount();}};
}};
