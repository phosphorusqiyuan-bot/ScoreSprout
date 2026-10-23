// Engraving only: keep all pitches, durations, voices and ties untouched.
// This also runs when opening/exporting an older library entry.
function layoutMusicXML(xml) {
  return xml.replace(/<part(?=\s|>)[^>]*>[\s\S]*?<\/part>/g, part => {
    let divisions=480, beats=4, beatType=4, staves=1;
    return part.replace(/<measure\b[^>]*>[\s\S]*?<\/measure>/g, measure => {
      divisions=Number(measure.match(/<divisions>(\d+)<\/divisions>/)?.[1]||divisions);
      beats=Number(measure.match(/<beats>(\d+)<\/beats>/)?.[1]||beats);
      beatType=Number(measure.match(/<beat-type>(\d+)<\/beat-type>/)?.[1]||beatType);
      staves=Number(measure.match(/<staves>(\d+)<\/staves>/)?.[1]||staves);
      const tokens=[], streams=new Map();
      let position=0, lastStart=0, length=0;
      const tokenPattern=/<note\b[^>]*>[\s\S]*?<\/note>|<(backup|forward)>[\s\S]*?<\/\1>/g;
      for(const match of measure.matchAll(tokenPattern)) {
        const text=match[0], duration=Number(text.match(/<duration>(\d+)<\/duration>/)?.[1]||0);
        if(!text.startsWith('<note')) { position+=text.startsWith('<backup>')?-duration:duration; continue; }
        const chord=/<chord\s*\/>/.test(text), grace=/<grace\b/.test(text);
        const start=chord?lastStart:position;
        if(!chord&&!grace) { lastStart=start; position+=duration; }
        length=Math.max(length,position);
        const staff=text.match(/<staff>(\d+)<\/staff>/)?.[1]||'1';
        const voice=text.match(/<voice>([^<]+)<\/voice>/)?.[1]||'1';
        const type=text.match(/<type>([^<]+)<\/type>/)?.[1];
        const event={text,start,duration,staff,chord,grace,rest:/<rest\b/.test(text),
          level:({eighth:1,'16th':2,'32nd':3,'64th':4,'128th':5})[type]||0,beams:[]};
        tokens.push(event);
        const key=`${staff}:${voice}`;
        if(!streams.has(key))streams.set(key,[]);
        if(!chord)streams.get(key).push(event);
      }
      const beat=divisions*4/beatType*(beatType===8&&beats>3&&beats%3===0?3:1);
      const fullLength=divisions*4*beats/beatType;
      // An anacrusis occupies the end of a bar, so its beams follow that beat phase.
      const phase=/implicit="yes"/.test(measure)?Math.max(0,fullLength-length):0;
      for(const stream of streams.values()) {
        let run=[];
        const flush=()=>{
          if(run.length>1)for(let level=1;level<=Math.max(...run.map(n=>n.level));level++) {
            for(let i=0;i<run.length;i++) {
              if(run[i].level<level)continue;
              const before=i>0&&run[i-1].level>=level, after=i+1<run.length&&run[i+1].level>=level;
              const value=before?(after?'continue':'end'):(after?'begin':(i?'backward hook':'forward hook'));
              run[i].beams.push(`<beam number="${level}">${value}</beam>`);
            }
          }
          run=[];
        };
        for(const event of stream) {
          const previous=run.at(-1);
          if(event.rest||event.grace||!event.level) { flush(); continue; }
          if(previous&&(previous.start+previous.duration!==event.start||
            Math.floor((previous.start+phase)/beat)!==Math.floor((event.start+phase)/beat)))flush();
          run.push(event);
        }
        flush();
      }
      let index=0;
      return measure.replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, () => {
        const event=tokens[index++];
        let text=event.text;
        if(!event.grace) {
          text=text.replace(/<beam\b[^>]*>[\s\S]*?<\/beam>/g,'');
          if(event.beams.length)text=text.replace(/<(?:notations|lyric|play)\b|<\/note>/, token=>event.beams.join('')+token);
        }
        // Put each hand's fingerings outside its staff; retain the actual suggestions.
        text=text.replace(/<fingering\b([^>]*)>/g, (_,attributes) =>
          `<fingering${attributes.replace(/\splacement="[^"]*"/g,'')} placement="${staves>1&&event.staff==='2'?'below':'above'}">`);
        // A silent auxiliary voice needs its duration, but not a duplicate visible rest.
        if(event.rest&&tokens.some(other=>!other.rest&&!other.grace&&other.staff===event.staff&&
          other.start<=event.start&&other.start+other.duration>=event.start+event.duration)) {
          text=text.replace(/<note\b([^>]*)>/,(_,attrs)=>`<note${attrs.replace(/\sprint-object="[^"]*"/g,'')} print-object="no">`);
        }
        return text;
      });
    });
  });
}

module.exports={layoutMusicXML};
