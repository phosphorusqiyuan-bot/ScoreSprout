const xml = value => String(value).replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' })[c]);
const sharpNames = [['C',0],['C',1],['D',0],['D',1],['E',0],['F',0],['F',1],['G',0],['G',1],['A',0],['A',1],['B',0]];
const flatNames = [['C',0],['D',-1],['D',0],['E',-1],['E',0],['F',0],['G',-1],['G',0],['A',-1],['A',0],['B',-1],['B',0]];
const drumPositions = { 35:['F',4],36:['F',4],37:['D',5],38:['C',5],40:['C',5],42:['F',5],44:['F',5],46:['F',5],49:['A',5],51:['G',5] };
const drumNames = { 35:'原声底鼓',36:'底鼓',37:'侧击',38:'军鼓',40:'电子军鼓',42:'闭合踩镲',44:'踏板踩镲',46:'开放踩镲',49:'碎音镲',51:'叮叮镲' };

function pitchXML(pitch, flats) {
  const [step, alter] = (flats ? flatNames : sharpNames)[pitch % 12];
  return `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${Math.floor(pitch / 12) - 1}</octave></pitch>`;
}
function durationPieces(ticks, start=0, measureStart=0, beatTicks=480) {
  const values = [[2880,'whole',true],[1920,'whole'],[1440,'half',true],[960,'half'],
    [720,'quarter',true],[480,'quarter'],[360,'eighth',true],[240,'eighth'],
    [180,'16th',true],[120,'16th'],[90,'32nd',true],[60,'32nd'],[30,'64th']];
  const out = [];
  let remain = ticks,position=start;
  while(remain>0) {
    const offset=(position-measureStart)%beatTicks;
    const limit=offset ? Math.min(remain,beatTicks-offset) : remain;
    const selected=values.find(([value])=>value<=limit);
    if(!selected)throw new Error('无法记谱的节奏长度。');
    const [duration,type,dot]=selected;
    out.push({start:position,duration,type,dot:!!dot});
    remain-=duration;position+=duration;
  }
  return out;
}
function allocateVoices(notes, preferLow=false) {
  const groups=new Map();
  for(const note of notes) {
    const key=`${note.start}:${note.duration}`;
    if(!groups.has(key))groups.set(key,{start:note.start,duration:note.duration,notes:[]});
    groups.get(key).notes.push(note);
  }
  const center=group=>group.notes.reduce((sum,note)=>sum+note.pitch,0)/group.notes.length;
  const ordered=[...groups.values()].sort((a,b)=>a.start-b.start ||
    (preferLow?center(a)-center(b):center(b)-center(a)) || b.duration-a.duration);
  const voices=[];
  for(const group of ordered) {
    const available=voices.filter(voice=>voice.end<=group.start)
      .sort((a,b)=>Math.abs(a.pitch-center(group))-Math.abs(b.pitch-center(group)) || b.end-a.end);
    const voice=available[0]||{end:0,pitch:center(group),groups:[]};
    if(!available.length)voices.push(voice);
    voice.groups.push(group);voice.end=group.start+group.duration;voice.pitch=center(group);
  }
  return voices.map(voice=>voice.groups);
}
function voicePieces(groups, measureStart, measureEnd, beatTicks) {
  const pieces=[];
  let position=measureStart;
  const append=(start,end,active)=>{
    for(const piece of durationPieces(end-start,start,measureStart,beatTicks))pieces.push({...piece,active});
  };
  for(const group of groups) {
    const start=Math.max(measureStart,group.start),end=Math.min(measureEnd,group.start+group.duration);
    if(end<=start)continue;
    if(start>position)append(position,start,[]);
    append(start,end,group.notes);position=end;
  }
  if(position<measureEnd)append(position,measureEnd,[]);
  return pieces;
}
function notesXML(pieces, staff, voice, instrument, flats, hideRests=false) {
  return pieces.map(piece => {
    const timing=`<duration>${piece.duration}</duration><voice>${voice}</voice><type>${piece.type}</type>${piece.dot?'<dot/>':''}`;
    if (!piece.active.length) return `<note${hideRests?' print-object="no"':''}><rest/>${timing}${staff?`<staff>${staff}</staff>`:''}</note>`;
    const unique = [...new Map(piece.active.map(n => [n.pitch,n])).values()].sort((a,b) => a.pitch-b.pitch);
    return unique.map((n, j) => {
      const prev = n.start < piece.start, next = n.start + n.duration > piece.start + piece.duration;
      const tie = `${prev ? '<tie type="stop"/>' : ''}${next ? '<tie type="start"/>' : ''}`;
      const tied = prev || next ? `<notations>${prev ? '<tied type="stop"/>' : ''}${next ? '<tied type="start"/>' : ''}</notations>` : '';
      const pos = drumPositions[n.pitch] || ['C',5];
      const position = instrument === 'drums' ? `<unpitched><display-step>${pos[0]}</display-step><display-octave>${pos[1]}</display-octave></unpitched>` : pitchXML(n.pitch, flats);
      const head = instrument === 'drums' && [42,44,46,49,51].includes(n.pitch) ? '<notehead parentheses="no">x</notehead>' : '';
      return `<note>${j ? '<chord/>' : ''}${position}<duration>${piece.duration}</duration>${tie}<voice>${voice}</voice><type>${piece.type}</type>${piece.dot?'<dot/>':''}${head}${staff ? `<staff>${staff}</staff>` : ''}${instrument === 'drums' ? `<instrument id="D${n.pitch}"/>` : ''}${tied}</note>`;
    }).join('');
  }).join('');
}

function renderPart(version, part, measureCount, measureTicks, partId) {
  const [num, den] = version.timeSignature;
  version = { ...version, instrument:part.instrument, notes:part.notes };
  const isPiano = version.instrument === 'piano', isDrums = version.instrument === 'drums';
  const name = { piano:'钢琴',guitar:'吉他',bass:'贝斯',drums:'鼓' }[version.instrument];
  const clef = isDrums ? '<sign>percussion</sign>' : version.instrument === 'bass' ? '<sign>F</sign><line>4</line>' : '<sign>G</sign><line>2</line>';
  const partList = isDrums
    ? `<score-part id="${partId}"><part-name>鼓</part-name>${[...new Set(version.notes.map(n=>n.pitch))].map(p=>`<score-instrument id="D${p}"><instrument-name>${xml(drumNames[p] || `打击乐 ${p}`)}</instrument-name><instrument-abbreviation>Perc</instrument-abbreviation></score-instrument><midi-instrument id="D${p}"><midi-channel>10</midi-channel><midi-unpitched>${p+1}</midi-unpitched></midi-instrument>`).join('')}</score-part>`
    : `<score-part id="${partId}"><part-name>${name}</part-name><score-instrument id="I${partId}"><instrument-name>${name}</instrument-name></score-instrument><midi-instrument id="I${partId}"><midi-channel>${{piano:1,guitar:2,bass:3}[version.instrument]}</midi-channel><midi-program>${{piano:1,guitar:25,bass:34}[version.instrument]}</midi-program></midi-instrument></score-part>`;
  const measures = [];
  const upperVoices=allocateVoices(version.notes.filter(n=>!isPiano || n.hand==='right'||(!n.hand&&n.pitch>=60)));
  const lowerVoices=isPiano?allocateVoices(version.notes.filter(n=>n.hand==='left'||(!n.hand&&n.pitch<60)),true):[];
  const beatTicks=version.ppq*4/den*(den===8&&num%3===0?3:1);
  for (let m = 0; m < measureCount; m++) {
    const start = m*measureTicks, end = start+measureTicks;
    const attributes = m ? '' : `<attributes><divisions>${version.ppq}</divisions><key><fifths>${version.keyFifths}</fifths><mode>${version.keyMode ? 'minor':'major'}</mode></key><time><beats>${num}</beats><beat-type>${den}</beat-type></time>${isPiano ? '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>' : `<clef>${clef}</clef>`}</attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${version.bpm}</per-minute></metronome></direction-type><sound tempo="${version.bpm}"/></direction>`;
    const streams=[];
    for(const [voices,staff,base] of [[upperVoices,isPiano?1:null,1],...(isPiano?[[lowerVoices,2,Math.max(1,upperVoices.length)+1]]:[])]) {
      let visible=0;
      for(const [index,groups] of voices.entries()) {
        const active=groups.filter(group=>group.start<end&&group.start+group.duration>start);
        if(!active.length)continue;
        streams.push(notesXML(voicePieces(active,start,end,beatTicks),staff,base+index,version.instrument,version.keyFifths<0,visible>0));
        visible++;
      }
      if(!visible)streams.push(notesXML(voicePieces([],start,end,beatTicks),staff,base,version.instrument,version.keyFifths<0));
    }
    measures.push(`<measure number="${m+1}">${attributes}${streams.join(`<backup><duration>${measureTicks}</duration></backup>`)}</measure>`);
  }
  return { partList, body:`<part id="${partId}">${measures.join('')}</part>` };
}
function versionToMusicXML(version) {
  const [num,den] = version.timeSignature, measureTicks=version.ppq*4*num/den;
  if (!Number.isInteger(measureTicks) || measureTicks % 30) throw new Error('此拍号无法用第一版的六十四分音符网格记谱。');
  const parts = version.parts?.length ? version.parts : [{instrument:version.instrument,notes:version.notes}];
  const lastTick = Math.max(...parts.flatMap(part=>part.notes.map(n=>n.start+n.duration)));
  const measureCount = Math.max(1,Math.ceil(lastTick/measureTicks));
  const rendered=parts.map((part,index)=>renderPart(version,part,measureCount,measureTicks,`P${index+1}`));
  const provenance=version.provenance?`<miscellaneous><miscellaneous-field name="ScoreSprout arrangement">${xml(version.provenance)}</miscellaneous-field></miscellaneous>`:'';
  return `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE score-partwise  PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0"><work><work-title>${xml(version.title)}</work-title></work><movement-title>${xml(version.title)} · ${xml({ beginner:'新手版',intermediate:'进阶版',full:'完整版' }[version.difficulty])}</movement-title><identification><creator type="software">ScoreSprout</creator>${provenance}</identification><defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults><part-list>${rendered.map(x=>x.partList).join('')}</part-list>${rendered.map(x=>x.body).join('')}</score-partwise>`;
}
module.exports = { versionToMusicXML };
