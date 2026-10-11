/* OKeys — offline chord studio. No tracking or remote assets. */
'use strict';
const $=id=>document.getElementById(id);
const M=window.Music;
let mode='piano',pianoSound='synth';
const keyboardNotes=new Map(),guitarSelections=new Map();
let state={root:null,accidental:0,octave:4},lastChord=null,previewIndex=-1;
let sheetSelection=null,sheetPlayback=null;
let sheetGate=null,sheetRelease=null,pendingSheetGate=null;
let saxVisual=null,saxHeld=new Set();
let drag=null,playSerial=0,visualFrame=0,toastTimer;
const chordTimers=new Map(),pointerNotes=new Map(),keys=new Map(),keyVisuals=new Map();
const engine=new AudioEngine(scheduleVisuals,M.detect);
const sectors=[];
let midiSignature='',midiHeld=[],midiMatch=null;
function reflectMidi(){
  const notes=[...new Set([...engine.voices.values()].filter(v=>v.source==='midi'&&v.held).map(v=>v.note))].sort((a,b)=>a-b);
  const signature=notes.join(',');if(signature===midiSignature)return;
  midiSignature=signature;midiHeld=notes;midiMatch=M.detect(notes);
  sectors.forEach(el=>el.classList.toggle('detected',el.dataset.chord===midiMatch?.chord.id));
  $('wheel-wrap').classList.toggle('midi-active',notes.length>0);
  if(notes.length)showMidi();else renderState();
}
function showMidi(){
  const root=midiMatch?M.names[midiMatch.root]:'—';
  $('center-root').textContent=root;
  $('chord-symbol').textContent=midiMatch?root+(midiMatch.chord.id==='major'?'':midiMatch.chord.label):'—';
  $('chord-description').textContent=midiMatch?'MIDI · '+midiMatch.chord.name:'MIDI · No exact chord';
  $('chord-notes').replaceChildren(...midiHeld.map(n=>{const span=document.createElement('span');span.textContent=M.noteName(n);return span;}));
  markChordKeys(midiMatch?midiHeld:[]);
}
function markChordKeys(notes){
  const marked=new Set(mode==='piano'?notes:[]);
  for(const [note,key] of keys)key.classList.toggle('chord-note',marked.has(note));
}
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function updateAudioStatus(){const c=engine.context;if(!c)return;$('audio-state').innerHTML=c.state==='running'?'<i></i>Audio ready':'<i></i>Click to resume audio';}
async function unlock(){try{await engine.unlock();updateAudioStatus();return true;}catch(error){notify(error.message);return false;}}
// Refresh only the status display; MIDI note scheduling never waits for this timer.
setInterval(updateAudioStatus,2000);
function scheduleVisuals(){if(!visualFrame)visualFrame=requestAnimationFrame(renderVoices);}
function renderVoices(){
  reflectMidi();
  visualFrame=0;const held=new Set(),sustained=new Map();let fading=false;
  for(const v of engine.voices.values()){
    // Wheel chords have an internal hold timer, not fingers holding keys.
    // In piano auto sustain, show their audio decay from the attack onward.
    const fadingWheel=mode==='piano'&&engine.autoSustain&&v.channel==='chord'&&!sheetPlayback;
    if(v.held&&!fadingWheel)held.add(v.note);
    else{const level=engine.level(v);if(level>0){sustained.set(v.note,Math.max(sustained.get(v.note)||0,level));fading=true;}}
  }
  for(const [note,el] of keys){
    const down=held.has(note),level=sustained.get(note)||0;
    const signature=down+':'+(level>0)+':'+level.toFixed(4);if(keyVisuals.get(note)===signature)continue;keyVisuals.set(note,signature);
    el.classList.toggle('pressed',down);el.classList.toggle('sustained',level>0&&!down);
    el.style.setProperty('--sustain-level',level.toFixed(4));
    el.setAttribute('aria-pressed',String(down||level>0));
  }
  for(const button of document.querySelectorAll('[data-sustain]')){
    button.classList.toggle('on',engine.autoSustain||engine.sustains.size>0);
    button.setAttribute('aria-pressed',String(engine.autoSustain));
    button.querySelector('span').textContent=engine.autoSustain?'Sustain · Auto':'Sustain · Off';
    button.title=engine.autoSustain?'Auto sustain on: released notes fade naturally.':'Auto sustain off: release a key or sheet label for a quick fade.';
  }
  renderSheetPlayback();
  renderSax();
  if(fading)scheduleVisuals();
}
function renderState(){
  $('center-root').textContent=M.rootLabel(state);
  $('root-hint').textContent=state.root?`${M.rootLabel(state)} selected · drag or choose a chord`:'Choose a note, or drag it into the wheel';
  $('octave').textContent=state.octave;$('octave-down').disabled=state.octave===1;$('octave-up').disabled=state.octave===5;
  for(const button of $('roots').children){const on=button.dataset.root===state.root&&Number(button.dataset.accidental)===state.accidental;button.classList.toggle('selected',on);button.setAttribute('aria-pressed',String(on));}
  for(const [id,value] of [['sharp',1],['flat',-1]]){$(id).setAttribute('aria-pressed',String(state.accidental===value));$(id).disabled=!state.root;}
  if(!state.root){setPreview(-1);$('chord-symbol').textContent='—';$('chord-description').textContent='Choose a root note.';$('chord-notes').replaceChildren();markChordKeys([]);}
  else if(lastChord)showChord(lastChord,false);
  else{$('chord-symbol').textContent='—';$('chord-description').textContent='Choose a chord.';$('chord-notes').replaceChildren();markChordKeys([]);}
  if(midiHeld.length)showMidi();
  if(mode==='guitar')renderGuitar(state.root?(previewIndex>=0?M.chords[previewIndex]:lastChord):null);
}
function clearSheetSelection(){sheetSelection=null;sheetPlayback=null;sectors.forEach(el=>{el.classList.remove('sheet-selected');el.style.removeProperty('--sheet-level');});}
function renderSheetPlayback(){
  if(!sheetPlayback?.released)return;
  let level=0;
  for(const v of engine.voices.values())if(v.channel==='chord')level=Math.max(level,engine.level(v));
  const sector=sectors.find(el=>el.dataset.chord===sheetSelection?.id);
  if(level>0){sector?.style.setProperty('--sheet-level',level.toFixed(4));return;}
  if(mode==='guitar'){
    // Keep the selected grips available after the sound ends.
    sheetPlayback=null;sectors.forEach(el=>{el.classList.remove('sheet-selected');el.style.removeProperty('--sheet-level');});return;
  }
  // The sheet selection is a temporary performance, just like released keys.
  clearSheetSelection();lastChord=null;renderState();
}
function dispatch(action){playSerial++;clearSheetSelection();state=M.reduce(state,action);renderState();}
function showChord(chord,playing){
  if(midiHeld.length){showMidi();return;}
  if(!state.root)return;
  const selectedSheet=sheetSelection?.id===chord.id?sheetSelection:null;
  $('chord-symbol').textContent=selectedSheet?.symbol||M.rootLabel(state)+(chord.id==='major'?'':chord.label);
  if(mode==='guitar')renderGuitar(chord);
  $('chord-description').textContent=chord.name+(playing?(engine.muteApp?' · visual only':' · playing'):'');
  const shape=mode==='guitar'?selectedGuitarShape(chord):null;
  const labels=shape?shape.frets.flatMap((f,i)=>f<0?[]:[M.noteName(Guitar.tuning[i]+f)]):M.spell(state,chord);
  if(selectedSheet?.bass!=null&&!shape)labels.unshift(M.noteName(sheetBass(M.notes(state,chord),selectedSheet.bass)));
  $('chord-notes').replaceChildren(...labels.map(text=>{const el=document.createElement('span');el.textContent=text;return el;}));
  const notes=M.notes(state,chord);
  if(selectedSheet?.bass!=null)notes.unshift(sheetBass(notes,selectedSheet.bass));
  markChordKeys(notes);
}
function clearChords(){
  sheetGate=null;sheetRelease=null;pendingSheetGate=null;
  for(const timer of chordTimers.values())clearTimeout(timer);chordTimers.clear();
  for(const [id,v] of engine.voices)if(id.startsWith('chord:'))engine.remove(id,true);
  for(const el of sectors)el.classList.remove('playing');
}
function sheetBass(notes,pitch){const ceiling=Math.min(...notes)-1;return ceiling-((ceiling-pitch)%12+12)%12;}
async function playChord(chord,sheet=null,gate=null){
  if(mode==='saxophone'&&!sheet)return;
  clearSheetSelection();sheetSelection=sheet;
  if(sheet)sectors.find(el=>el.dataset.chord===chord.id)?.classList.add('sheet-selected');
  if(!state.root){notify('Choose a root note first: A, B, C, D, E, F or G.');return;}
  // Capture the selection before audio resume, then discard stale asynchronous requests.
  const serial=++playSerial,selection={...state};
  if(!await unlock()||serial!==playSerial)return;
  clearChords();engine.beginChord();lastChord=chord;showChord(chord,true);
  if(mode==='saxophone'){saxVisual=null;renderSax();}
  if(sheet)sheetPlayback={released:false};
  const index=M.chords.indexOf(chord);if(sectors[index])sectors[index].classList.add('playing');
  const shape=mode==='guitar'?selectedGuitarShape(chord):null;
  const notes=shape?shape.frets.flatMap((f,i)=>f<0?[]:[Guitar.tuning[i]+f]):M.notes(selection,chord);
  if(sheet?.bass!=null&&!shape)notes.unshift(sheetBass(notes,sheet.bass));
  const guitarGain=shape?engine.guitarChordGain(notes,M.notes(selection,chord)):1;
  notes.forEach((note,i)=>{
    if(mode!=='guitar'||gate){engine.start('chord:'+note,note,92,'app','chord',guitarGain);return;}
    const id='strum:'+i;chordTimers.set(id,setTimeout(()=>{chordTimers.delete(id);if(serial===playSerial)engine.start('chord:'+i+':'+note,note,92-i*2,'app','chord',guitarGain);},i*18));
  });
  const release=()=>{
    // A quick mouse-up can arrive before the guitar strum has finished.
    for(const [id,timer] of chordTimers)if(id.startsWith('strum:')){clearTimeout(timer);chordTimers.delete(id);}
    for(const [id] of engine.voices)if(id.startsWith('chord:'))engine.release(id);
    sectors[index]?.classList.remove('playing');chordTimers.delete('chord');
    if(sheetPlayback&&sheetSelection===sheet)sheetPlayback.released=true;
    if(lastChord===chord)showChord(chord,false);
    scheduleVisuals();
    sheetGate=null;sheetRelease=null;
  };
  if(gate){sheetGate=gate;sheetRelease=release;if(gate.released)release();}
  else chordTimers.set('chord',setTimeout(release,sheet?180:2500));
}
function setPreview(index){
  if(index===previewIndex)return;previewIndex=index;
  sectors.forEach((el,i)=>el.classList.toggle('preview',i===index));
  const chord=index<0?null:M.chords[index];
  const notes=chord&&state.root?M.notes(state,chord):[];
  for(const [note,el] of keys)el.classList.toggle('preview',notes.includes(note));
  if(chord&&state.root)showChord(chord,false);
  else if(state.root&&lastChord)showChord(lastChord,false);
}
const roots=[['C',0],['C',1],['D',0],['D',1],['E',0],['F',0],['F',1],['G',0],['G',1],['A',0],['A',1],['B',0]];
for(const [root,accidental] of roots){
  const button=document.createElement('button');button.className='root-button'+(accidental?' black-root':'');button.textContent=root+(accidental?'♯':'');button.dataset.root=root;button.dataset.accidental=accidental;button.setAttribute('aria-label',`Root ${root}${accidental?' sharp':''}`);button.setAttribute('aria-pressed','false');
  button.addEventListener('pointerdown',event=>{if(event.button!==0||drag)return;event.preventDefault();void unlock();dispatch({type:'select',root,accidental});drag={pointer:event.pointerId,button};button.setPointerCapture(event.pointerId);$('wheel-wrap').classList.add('dragging');});
  button.addEventListener('click',event=>{if(event.detail===0)dispatch({type:'select',root,accidental});});
  $('roots').append(button);
}
const ns='http://www.w3.org/2000/svg';
function svgEl(name,attrs){const el=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);return el;}
function point(r,a){return [r*Math.cos(a),r*Math.sin(a)];}
M.chords.slice(0,26).forEach((chord,index)=>{
  const ring=index<13?0:1,inner=ring?134:68,outer=ring?196:130;
  const start=(index%13)*Math.PI*2/13-Math.PI/2+.008,end=start+Math.PI*2/13-.016;
  const a=point(inner,start),b=point(outer,start),c=point(outer,end),d=point(inner,end),mid=(start+end)/2;
  const group=svgEl('g',{class:'sector'+(ring?' outer':''),role:'button',tabindex:'0','aria-label':`${chord.name}, shortcut ${chord.key}`,'data-chord':chord.id});
  group.append(svgEl('path',{d:`M ${a} L ${b} A ${outer} ${outer} 0 0 1 ${c} L ${d} A ${inner} ${inner} 0 0 0 ${a} Z`}));
  const pos=point((inner+outer)/2,mid),label=svgEl('text',{x:pos[0],y:pos[1]-1,'text-anchor':'middle'});label.textContent=chord.label;
  const hint=svgEl('text',{x:pos[0],y:pos[1]+11,'text-anchor':'middle',class:'key-label'});hint.textContent=chord.key;group.append(label,hint);
  group.addEventListener('pointerenter',()=>{if(!drag)setPreview(index);});group.addEventListener('pointerleave',()=>{if(!drag)setPreview(-1);});
  group.addEventListener('click',()=>{if(!drag)void playChord(chord);});
  group.addEventListener('keydown',event=>{if(event.code==='Enter'||event.code==='Space'){event.preventDefault();void playChord(chord);}});
  sectors.push(group);$('wheel').append(group);
});
function dragIndex(event){const rect=$('wheel').getBoundingClientRect();return M.wheelIndex((event.clientX-rect.left-rect.width/2)*404/rect.width,(event.clientY-rect.top-rect.height/2)*404/rect.height);}
document.addEventListener('pointermove',event=>{
  if(drag&&event.pointerId===drag.pointer)setPreview(dragIndex(event));
  if(pointerNotes.has(event.pointerId)){const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-midi]');const midi=target?Number(target.dataset.midi):null;movePianoPointer(event.pointerId,midi);}
});
function endDrag(event,cancelled=false){
  if(drag&&event.pointerId===drag.pointer){const index=cancelled?-1:dragIndex(event);const previous=drag;drag=null;if(previous.button.hasPointerCapture(event.pointerId))previous.button.releasePointerCapture(event.pointerId);$('wheel-wrap').classList.remove('dragging');setPreview(-1);if(index>=0)void playChord(M.chords[index]);}
  if(pointerNotes.has(event.pointerId)){releasePianoPointer(event.pointerId);pointerNotes.delete(event.pointerId);renderSax();}
}
document.addEventListener('pointerup',event=>endDrag(event));document.addEventListener('pointercancel',event=>endDrag(event,true));
$('roots').addEventListener('lostpointercapture',event=>{if(drag?.pointer===event.pointerId)endDrag(event,true);});
function buildKeyboard(){
  keys.clear();keyVisuals.clear();$('piano').replaceChildren();
  const first=mode==='saxophone'?48:21,last=mode==='saxophone'?89:108;
  const isBlack=n=>[1,3,6,8,10].includes(n%12);
  const whites=Array.from({length:last-first+1},(_,i)=>first+i).filter(n=>!isBlack(n)).length;
  let white=0;
  for(let midi=first;midi<=last;midi++){
    const black=isBlack(midi),key=document.createElement('button');
    key.className='piano-key'+(black?' black':'');key.dataset.midi=midi;key.title=M.noteName(midi);key.setAttribute('aria-label',M.noteName(midi));key.setAttribute('aria-pressed','false');key.tabIndex=mode==='saxophone'?0:-1;
    key.style.left=((white-(black?.31:0))/whites*100)+'%';key.style.width=((black?.62:1)/whites*100)+'%';
    if(mode==='saxophone'||midi%12===0||midi===21)key.textContent=M.noteName(midi);
    if(!black)white++;
    key.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();pointerNotes.set(event.pointerId,midi);key.setPointerCapture(event.pointerId);renderSax();const serial=playSerial;void unlock().then(ok=>{if(ok&&serial===playSerial&&pointerNotes.get(event.pointerId)===midi)engine.start('pointer:'+event.pointerId+':'+midi,midi,100);});});
    key.addEventListener('lostpointercapture',event=>{if(pointerNotes.has(event.pointerId)){releasePianoPointer(event.pointerId);pointerNotes.delete(event.pointerId);renderSax();}});
    key.addEventListener('keydown',event=>{if(!['Space','Enter'].includes(event.code)||event.repeat)return;event.preventDefault();keyboardNotes.set(event.code,midi);renderSax();const serial=playSerial;void unlock().then(ok=>{if(ok&&serial===playSerial&&keyboardNotes.get(event.code)===midi)engine.start('key:'+event.code,midi,100);});});
    keys.set(midi,key);$('piano').append(key);
  }
}
function releasePianoPointer(pointer){engine.release('pointer:'+pointer+':'+pointerNotes.get(pointer));}
function movePianoPointer(pointer,midi){const previous=pointerNotes.get(pointer);if(previous===midi)return;releasePianoPointer(pointer);pointerNotes.set(pointer,midi);renderSax();if(midi!==null)engine.start('pointer:'+pointer+':'+midi,midi,100);}
function renderSax(){
  if(mode!=='saxophone')return;
  const notes=new Set([...pointerNotes.values(),...keyboardNotes.values()].filter(n=>n!==null));
  const chordHeld=[...engine.voices.values()].some(v=>v.channel==='chord'&&v.held);
  // Latch on a new single-note press, never on the release of a multi-key gesture.
  if(notes.size>1||chordHeld)saxVisual=null;
  else if(notes.size===1&&!saxHeld.has([...notes][0]))saxVisual=[...notes][0];
  saxHeld=notes;
  const note=saxVisual,fingering=note===null?null:SaxophoneData.fingerings[note-48];
  const pressed=new Set(fingering||[]);
  $('sax-diagram').style.setProperty('--sax-level','1');
  document.querySelectorAll('[data-sax-key]').forEach(el=>el.classList.toggle('closed',pressed.has(Number(el.dataset.saxKey))));
  if(!fingering){$('sax-note').textContent='Choose a note';$('sax-hint').textContent='Press one keyboard key to see its fingering.';$('sax-diagram').querySelector('svg').setAttribute('aria-label','Saxophone fingering diagram');return;}
  $('sax-note').textContent=M.noteName(note);
  $('sax-hint').textContent=pressed.size?`${pressed.size} keys pressed`:'All keys open';
  $('sax-diagram').querySelector('svg').setAttribute('aria-label',`${M.noteName(note)} saxophone fingering, ${pressed.size} keys pressed`);
}
function guitarBass(chord){return sheetSelection?.id===chord.id?sheetSelection.bass:null;}
function guitarSelectionKey(chord){const bass=guitarBass(chord);return ((M.naturals[state.root]+state.accidental+12)%12)+':'+chord.id+(bass==null?'':'/'+bass);}
function selectedGuitarShape(chord){
  if(!state.root||!chord)return null;
  const shapes=Guitar.voicings(M.naturals[state.root]+state.accidental,chord,guitarBass(chord));
  return shapes[guitarSelections.get(guitarSelectionKey(chord))||0]||shapes[0]||null;
}
function guitarSvg(shape,name,bass=null){
  const svg=svgEl('svg',{viewBox:'0 0 190 190',role:'img',class:'guitar-diagram','aria-label':name+' guitar fingering'});
  const label=(text,x,y,attrs={})=>{const el=svgEl('text',{x,y,'text-anchor':'middle',...attrs});el.textContent=text;svg.append(el);};
  for(let i=0;i<6;i++)svg.append(svgEl('line',{x1:35+i*24,y1:35,x2:35+i*24,y2:155,class:'fret-line'}));
  for(let i=0;i<=5;i++)svg.append(svgEl('line',{x1:35,y1:35+i*24,x2:155,y2:35+i*24,class:i===0&&(!shape||shape.start===1)?'fret-nut':'fret-line'}));
  ['E','A','D','G','B','E'].forEach((n,i)=>label(n,35+i*24,177));
  if(!shape)return svg;
  if(shape.start>1)for(let row=0;row<5;row++)label(shape.start+row,17,51+row*24,{class:'fret-number'});
  const isBass=string=>bass!=null&&shape.bassStrings?.includes(string);
  shape.frets.forEach((f,i)=>{if(f<=0)label(f===0?'○':'×',35+i*24,24,{class:isBass(i)?'slash-bass-label':''});});
  for(const group of shape.groups){
    const y=47+(group.fret-shape.start)*24;
    if(group.strings.length>1)svg.append(svgEl('line',{x1:35+group.strings[0]*24,y1:y,x2:35+group.strings.at(-1)*24,y2:y,class:'barre'}));
    for(const string of group.strings){svg.append(svgEl('circle',{cx:35+string*24,cy:y,r:8,class:'finger-dot'+(isBass(string)?' slash-bass-dot':'')}));label(group.finger,35+string*24,y+3.5,{class:'finger-number'});}
  }
  svg.setAttribute('aria-label',`${name}: low E to high E, ${shape.frets.map(f=>f<0?'muted':f===0?'open':'fret '+f).join(', ')}`);
  return svg;
}
function renderGuitar(chord){
  const container=$('guitar-diagrams');
  const selectedSheet=sheetSelection?.id===chord?.id?sheetSelection:null;
  const shapes=chord&&state.root?Guitar.voicings(M.naturals[state.root]+state.accidental,chord,guitarBass(chord)):[];
  const name=chord&&state.root?(selectedSheet?.symbol||M.rootLabel(state)+(chord.id==='major'?'':chord.label)):'Choose a chord';
  const key=shapes.length?guitarSelectionKey(chord):'',selected=guitarSelections.get(key)||0;
  // Leave focused shape buttons intact during playback/status refreshes.
  const renderKey=key+':'+name;
  if(shapes.length&&container.dataset.chord===renderKey){
    [...container.children].forEach((card,index)=>card.setAttribute('aria-pressed',String(index===selected)));
    return;
  }
  container.dataset.chord=renderKey;
  const signature=renderKey+':'+selected;if(container.dataset.selection===signature)return;container.dataset.selection=signature;
  $('guitar-title').textContent=name;
  $('guitar-hint').textContent=shapes.length?'Standard tuning · E A D G B E'+(selectedSheet?.bass!=null?' · '+M.names[(selectedSheet.bass+12)%12]+' in the bass':' · common shapes first'):chord?'No playable grip found for this voicing.':'Choose a root and a chord on the wheel.';
  container.replaceChildren();
  if(!shapes.length){container.append(guitarSvg(null,name));return;}
  shapes.forEach((shape,index)=>{
    const card=document.createElement('button');card.type='button';card.className='guitar-shape';card.setAttribute('aria-pressed',String(index===selected));
    card.setAttribute('aria-label',`${name}, ${shape.label}, position ${shape.start}, play fingering ${index+1}`);
    const title=document.createElement('span');title.className='shape-title';title.textContent=(index===0&&shape.priority<2?'Common · ':'')+shape.label;
    const detail=document.createElement('span');detail.className='shape-detail';detail.textContent=shape.omittedDegrees.length?'Omits '+shape.omittedDegrees.join(', '):shape.start===1?'Open position':`Frets ${shape.start}–${shape.start+4}`;
    card.append(title,guitarSvg(shape,name,selectedSheet?.bass),detail);
    card.addEventListener('click',()=>{guitarSelections.set(key,index);void playChord(chord,selectedSheet);});container.append(card);
  });
}
$('sax-diagram').innerHTML=SaxophoneData.template;
const pianoShortcuts=$('mode-shortcuts').innerHTML;
function setMode(next){
  if(next===mode)return;
  if(mode==='piano')pianoSound=engine.instrument;
  panic();mode=next;document.body.dataset.mode=mode;applyModeSound();
  document.querySelector('.explorer').setAttribute('aria-label',mode==='saxophone'?'Saxophone fingering explorer':'Chord explorer');
  if(mode!=='piano')bindMidi(null);else refreshMidi();
  $('guitar-panel').hidden=mode!=='guitar';$('sax-panel').hidden=mode!=='saxophone';
  document.querySelector('.piano-panel').hidden=mode==='guitar';
  document.querySelector('.piano-panel').setAttribute('aria-label',mode==='saxophone'?'42-key saxophone keyboard':'88-key piano');
  $('keyboard-range').textContent=mode==='saxophone'?'42 keys / C3 — F6':'88 keys / A0 — C8';
  $('mode-shortcuts').innerHTML=mode==='saxophone'?'Click or touch a key · Enter plays a focused key · Esc stops sound':pianoShortcuts;
  buildKeyboard();renderState();renderSax();scheduleVisuals();
}
document.querySelectorAll('input[name="mode"]').forEach(input=>input.addEventListener('change',()=>setMode(input.value)));
document.addEventListener('sheet-chord-select',event=>{
  if(event.detail.gate&&engine.autoSustain){pendingSheetGate=event.detail.gate;pendingSheetGate.pending=event.detail;return;}
  const selected=window.SheetMusic.wheelChord(event.detail?.symbol||'');if(!selected)return;
  const chord=M.chords.find(c=>c.id===selected.id);
  dispatch({type:'select',root:selected.root,accidental:selected.accidental});
  if(!chord){lastChord=null;renderState();notify(`${selected.symbol}: this chord type is not on the wheel yet.`);return;}
  lastChord=chord;sheetSelection=selected;showChord(chord,false);void playChord(chord,selected,event.detail.gate);
});
document.addEventListener('sheet-chord-release',event=>{
  const gate=event.detail.gate;
  if(pendingSheetGate===gate){pendingSheetGate=null;if(!gate.cancelled)document.dispatchEvent(new CustomEvent('sheet-chord-select',{detail:{...gate.pending,gate:null}}));}
  if(sheetGate===gate)sheetRelease?.();
});
document.addEventListener('sheet-playback-stop',()=>{playSerial++;clearChords();clearSheetSelection();});
window.addEventListener('blur',()=>{pendingSheetGate=null;if(sheetGate){sheetGate.released=true;sheetRelease?.();}});
buildKeyboard();
function panic(){playSerial++;clearChords();engine.panic();pointerNotes.clear();keyboardNotes.clear();saxVisual=null;saxHeld.clear();renderSax();if(drag){const previous=drag;drag=null;if(previous.button.hasPointerCapture(previous.pointer))previous.button.releasePointerCapture(previous.pointer);}$('wheel-wrap').classList.remove('dragging');lastChord=null;dispatch({type:'clear'});}
let pendingControl=null;
document.addEventListener('pointerdown',()=>document.body.classList.remove('keyboard-navigation'),true);
// Left/right must not change the last-clicked radio, slider or sheet position.
// Keep native cursor movement inside actual text editors.
document.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight'].includes(event.code)||event.ctrlKey||event.altKey||event.metaKey||event.isComposing)return;
  if(event.target.closest('textarea,input:not([type="radio"]):not([type="range"]),[contenteditable="true"],[role="textbox"]'))return;
  event.preventDefault();event.stopImmediatePropagation();
},true);
document.addEventListener('keydown',event=>{
  // Sheet Tab is handled in capture; native Tab focus is only used in dialogs.
  if(event.code==='Tab'){document.body.classList.add('keyboard-navigation');return;}
  document.body.classList.remove('keyboard-navigation');
  if(event.code==='ControlLeft'||event.code==='ControlRight'){
    if(!event.repeat&&!$('help').open&&!event.altKey&&!event.metaKey)pendingControl={code:event.code,root:state.root};
    return;
  }
  // A Ctrl combination belongs to the browser; only a standalone tap means flat.
  if(pendingControl)pendingControl=null;
  if(event.code==='Escape'){panic();if($('help').open)$('help').close();return;}
  if(mode==='saxophone')return;
  if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing||event.repeat||$('help').open)return;
  if(event.code==='ShiftLeft'||event.code==='ShiftRight'){event.preventDefault();if(state.root)dispatch({type:'accidental',value:1});return;}
  if(event.target.matches('input,select,textarea')||event.target.isContentEditable)return;
  if(/^Key[A-G]$/.test(event.code)){event.preventDefault();void unlock();dispatch({type:'root',root:event.code.slice(3)});if(event.shiftKey&&state.root)dispatch({type:'accidental',value:1});}
  else if(event.code==='ArrowUp'||event.code==='ArrowDown'){event.preventDefault();dispatch({type:'octave',delta:event.code==='ArrowUp'?1:-1});}
  else{const chord=M.chordForCode(event.code);if(chord){event.preventDefault();void playChord(chord);}}
});
document.addEventListener('keyup',event=>{
  if(keyboardNotes.has(event.code)){engine.release('key:'+event.code);keyboardNotes.delete(event.code);renderSax();}
  if(pendingControl?.code===event.code){const previous=pendingControl;pendingControl=null;if(previous.root&&state.root===previous.root&&!$('help').open){event.preventDefault();dispatch({type:'accidental',value:-1});}}
});
$('sharp').onclick=()=>dispatch({type:'accidental',value:1});$('flat').onclick=()=>dispatch({type:'accidental',value:-1});
$('octave-up').onclick=()=>dispatch({type:'octave',delta:1});$('octave-down').onclick=()=>dispatch({type:'octave',delta:-1});
$('panic').onclick=panic;
for(const button of document.querySelectorAll('[data-sustain]'))button.onclick=()=>engine.setAutoSustain(!engine.autoSustain);
for(const id of ['volume','guitar-volume']){
  $(id).oninput=event=>{engine.setVolume(Number(event.target.value)/100);$('volume').value=event.target.value;$('guitar-volume').value=event.target.value;};
  $(id).addEventListener('pointerup',()=>$(id).blur());
}
$('guitar-stop').onclick=panic;
$('mute-app').onclick=()=>{engine.setMuted(!engine.muteApp);$('mute-app').setAttribute('aria-pressed',String(engine.muteApp));$('mute-app').innerHTML=engine.muteApp?'♪ <span>MIDI sound only</span>':'♫ <span>Mute app sound</span>';if(lastChord)showChord(lastChord,false);};
$('help-button').onclick=()=>$('help').showModal();$('help-close').onclick=()=>$('help').close();
for(const chord of M.chords){const row=document.createElement('div');row.className='shortcut-item';const label=document.createElement('span');label.textContent=chord.label;const key=document.createElement('kbd');key.textContent=chord.key;row.append(label,key);$('shortcuts').append(row);}
// MIDI is opt-in. No SysEx permission or MIDI output is requested.
let midiAccess=null,activeInput=null,preferredInput=null;
const midiSelector=new GlassSelect($('midi-devices'),'MIDI input device',bindMidi);
const instrumentSelector=new GlassSelect($('instrument'),'Instrument sound',value=>{engine.instrument=value;if(mode==='piano')pianoSound=value;});
function applyModeSound(){
  const options=[...(engine.samples.size?[{value:'grand',label:'Grand piano'}]:[]),{value:'synth',label:'Soft synth'},{value:'guitar',label:'Plucked guitar'},{value:'saxophone',label:'Reed saxophone'}];
  engine.instrument=mode==='piano'?pianoSound:mode;instrumentSelector.setOptions(options,engine.instrument);
}
instrumentSelector.setOptions([{value:'synth',label:'Soft synth'}],'synth');
engine.instrument='synth';
$('audio-state').innerHTML='<i></i>Loading grand piano…';
engine.preload(window.PianoSamples||{}).then(()=>{
  if(!engine.samples.size)throw new Error('No samples');
  pianoSound='grand';applyModeSound();
  $('audio-state').innerHTML='<i></i>Grand piano ready';window.PianoSamples=null;
}).catch(()=>{applyModeSound();notify('Grand piano could not load. Soft synth is available. Reload to try again.');});
function bindMidi(id){
  if(activeInput){activeInput.onmidimessage=null;void activeInput.close();}
  engine.stopSource('midi');for(const channel of [...engine.sustains])if(channel!=='chord')engine.pedal(channel,false);
  activeInput=mode==='piano'&&midiAccess?midiAccess.inputs.get(id):null;
  if(activeInput){preferredInput=activeInput.id;activeInput.onmidimessage=event=>{if(mode==='piano'&&activeInput)engine.midi(event.data,activeInput.id);};void activeInput.open().catch(error=>notify('Could not open MIDI input: '+error.message));}
  $('midi-connect').innerHTML=activeInput?'⌁ <span>MIDI connected</span>':'⌁ <span>No MIDI device</span>';
  $('midi-connect').title=activeInput?activeInput.name:'Plug in a MIDI keyboard. Devices appear automatically.';
}
function refreshMidi(){
  if(!midiAccess||mode!=='piano')return;
  const available=[...midiAccess.inputs.values()].filter(input=>input.state==='connected');
  const current=activeInput?.id;
  $('midi-devices').hidden=available.length===0;
  const chosen=available.find(input=>input.id===preferredInput)||available[0];
  midiSelector.setOptions(available.map(input=>({value:input.id,label:input.name||'MIDI keyboard'})),chosen?.id);
  if(chosen){if(chosen.id!==current)bindMidi(chosen.id);}
  else{bindMidi(null);if(current)notify('MIDI keyboard disconnected. Its notes have been stopped.');}
}
$('midi-connect').onclick=async()=>{
  if(mode!=='piano')return;
  if(!await unlock())return;
  if(!navigator.requestMIDIAccess){notify('MIDI needs Chrome or Edge. Use “Launch OKeys.vbs” to open the local app.');return;}
  if(!window.isSecureContext){notify('MIDI needs a secure local address. Open the app with “Launch OKeys.vbs”.');return;}
  try{if(!midiAccess){midiAccess=await navigator.requestMIDIAccess({sysex:false});midiAccess.onstatechange=refreshMidi;}refreshMidi();if(!activeInput)notify('MIDI is ready. Plug in your keyboard; it will appear here automatically.');}
  catch(error){notify(error.name==='NotAllowedError'?'MIDI access was denied. Allow MIDI in this browser’s site permissions, then try again.':'Could not connect MIDI: '+error.message);}
};
// Browser fullscreen requires a gesture; the optional launcher requests it at startup.
$('fullscreen-button').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notify('Fullscreen is unavailable here. In Chrome or Edge, press F11.');}};
document.addEventListener('fullscreenchange',()=>{const on=!!document.fullscreenElement;$('fullscreen-button').innerHTML=on?'⛶ <span>Exit fullscreen</span>':'⛶ <span>Fullscreen</span>';$('fullscreen-button').setAttribute('aria-label',on?'Exit fullscreen':'Enter fullscreen');});
// Constrain both dimensions to the actual space left after the toolbar and footer.
new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;const desktop=matchMedia('(min-width: 851px)').matches;$('wheel-wrap').style.width=Math.floor(desktop?Math.min(width,height,560):Math.min(width,480))+'px';}).observe(document.querySelector('.wheel-area'));
// A focus change releases mouse touches; hardware MIDI keeps working when switching apps.
window.addEventListener('blur',()=>{pendingControl=null;playSerial++;for(const pointer of pointerNotes.keys())releasePianoPointer(pointer);pointerNotes.clear();for(const code of keyboardNotes.keys())engine.release('key:'+code);keyboardNotes.clear();renderSax();if(drag){const previous=drag;drag=null;if(previous.button.hasPointerCapture(previous.pointer))previous.button.releasePointerCapture(previous.pointer);}$('wheel-wrap').classList.remove('dragging');setPreview(-1);});
window.addEventListener('pagehide',()=>engine.panic());
// Start the device on the earliest gesture, before a chord's click handler.
// Recover on focus/pageshow as well as visibility, including interrupted contexts.
let audioActivated=engine.context?.state==='running';
function prepareAudio(){audioActivated=true;void unlock();}
function restoreAudio(){if(audioActivated&&!document.hidden)void unlock();}
document.addEventListener('pointerdown',prepareAudio,true);
document.addEventListener('keydown',prepareAudio,true);
window.addEventListener('focus',restoreAudio);
window.addEventListener('pageshow',restoreAudio);
document.addEventListener('visibilitychange',restoreAudio);
engine.context?.addEventListener('statechange',()=>{updateAudioStatus();if(engine.context.state==='interrupted'||engine.context.state==='suspended')restoreAudio();});
engine.setAutoSustain(true);
renderState();
// The tiny optional local launcher exits automatically after the last app tab closes.
if(location.hostname==='127.0.0.1'||location.hostname==='localhost'){
  const heartbeat=()=>fetch('/__okeys_ping',{cache:'no-store'}).catch(()=>{});void heartbeat();setInterval(heartbeat,15000);
}
