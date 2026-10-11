(function (scope) {
  'use strict';
  // Intervals retain the complete reference voicings, including the 11th in 13ths.
  const definitions = [
    ['major','maj','Major','J',[0,4,7],['1','3','5']],
    ['minor','m','Minor','K',[0,3,7],['1','b3','5']],
    ['7','7','Dominant seventh','7',[0,4,7,10],['1','3','5','b7']],
    ['m7','m7','Minor seventh','M',[0,3,7,10],['1','b3','5','b7']],
    ['maj7','maj7','Major seventh','P',[0,4,7,11],['1','3','5','7']],
    ['6','6','Major sixth','6',[0,4,7,9],['1','3','5','6']],
    ['m6','m6','Minor sixth','H',[0,3,7,9],['1','b3','5','6']],
    ['dim','dim','Diminished','L',[0,3,6],['1','b3','b5']],
    ['dim7','dim7','Diminished seventh','Q',[0,3,6,9],['1','b3','b5','bb7']],
    ['aug','aug','Augmented',';',[0,4,8],['1','3','#5']],
    ['sus4','sus4','Suspended fourth','I',[0,5,7],['1','4','5']],
    ['sus2','sus2','Suspended second','U',[0,2,7],['1','2','5']],
    ['7sus4','7sus4','Seventh suspended fourth','O',[0,5,7,10],['1','4','5','b7']],
    ['m7b5','m7♭5','Half diminished','W',[0,3,6,10],['1','b3','b5','b7']],
    ['7b5','7♭5','Seventh flat fifth','R',[0,4,6,10],['1','3','b5','b7']],
    ['7#5','7♯5','Seventh sharp fifth','T',[0,4,8,10],['1','3','#5','b7']],
    ['9','9','Dominant ninth','9',[0,4,7,10,14],['1','3','5','b7','9']],
    ['m9','m9','Minor ninth','N',[0,3,7,10,14],['1','b3','5','b7','9']],
    ['maj9','maj9','Major ninth','V',[0,4,7,11,14],['1','3','5','7','9']],
    ['add9','add9','Added ninth','Y',[0,4,7,14],['1','3','5','9']],
    ['7b9','7♭9','Seventh flat ninth','[',[0,4,7,10,13],['1','3','5','b7','b9']],
    ['7#9','7♯9','Seventh sharp ninth',']',[0,4,7,10,15],['1','3','5','b7','#9']],
    ['11','11','Dominant eleventh','1',[0,4,7,10,14,17],['1','3','5','b7','9','11']],
    ['m11','m11','Minor eleventh','2',[0,3,7,10,14,17],['1','b3','5','b7','9','11']],
    ['13','13','Dominant thirteenth','3',[0,4,7,10,14,17,21],['1','3','5','b7','9','11','13']],
    ['m13','m13','Minor thirteenth','4',[0,3,7,10,14,17,21],['1','b3','5','b7','9','11','13']],
    ['maj13','maj13','Major thirteenth','5',[0,4,7,11,14,21],['1','3','5','7','9','13']]
  ];
  const chords = definitions.map(([id,label,name,key,intervals,degrees]) => ({id,label,name,key,intervals,degrees}));
  const naturals = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const mod = (n,m) => (n%m+m)%m;
  function rootLabel(state) { return state.root ? state.root + (state.accidental === 1 ? '♯' : state.accidental === -1 ? '♭' : '') : '—'; }
  function reduce(state, action) {
    if(action.type === 'clear') return {...state,root:null,accidental:0};
    if(action.type === 'root') return state.root === action.root ? {...state,root:null,accidental:0} : {...state,root:action.root,accidental:0};
    if(action.type === 'select') return {...state,root:action.root,accidental:action.accidental || 0};
    if(action.type === 'accidental' && state.root) return {...state,accidental:state.accidental === action.value ? 0 : action.value};
    if(action.type === 'octave') return {...state,octave:Math.max(1,Math.min(5,state.octave+action.delta))};
    return state;
  }
  function notes(state,chord) {
    if(!state.root) return [];
    return chord.intervals.map(n => 12*(state.octave+1)+naturals[state.root]+state.accidental+n);
  }
  function spell(state,chord) {
    const letters = 'CDEFGAB';
    return chord.degrees.map((degree,i) => {
      const d = Number(degree.replace(/[^0-9]/g,''))-1;
      const letterIndex = letters.indexOf(state.root)+d;
      const letter = letters[letterIndex%7];
      const octave = state.octave+Math.floor(letterIndex/7);
      const midi = notes(state,chord)[i];
      const offset = midi-(12*(octave+1)+naturals[letter]);
      return letter+(offset>0?'♯'.repeat(offset):'♭'.repeat(-offset))+octave;
    });
  }
  function noteName(midi) { return names[mod(midi,12)]+(Math.floor(midi/12)-1); }
  function chordForCode(code) {
    const key = code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : ({Semicolon:';',BracketLeft:'[',BracketRight:']'})[code];
    return chords.find(c=>c.key===key);
  }
  function wheelIndex(x,y) {
    const r=Math.hypot(x,y);
    if(r<66 || r>196) return -1;
    const angle=mod(Math.atan2(y,x)+Math.PI/2,2*Math.PI);
    return Math.floor(angle/(2*Math.PI/13))+(r>=132?13:0);
  }
  // Exact pitch-class sets: octave doubling and inversions are allowed, missing
  // or additional pitches are not. Prefer the bass as root for ambiguous sets.
  function detect(notes) {
    if(!notes.length)return null;
    const pitches=new Set(notes.map(n=>mod(n,12))),bass=mod(Math.min(...notes),12),matches=[];
    for(let root=0;root<12;root++)for(const chord of chords){
      const expected=new Set(chord.intervals.map(n=>mod(root+n,12)));
      if(expected.size===pitches.size&&[...expected].every(n=>pitches.has(n)))matches.push({root,chord});
    }
    return matches.find(match=>match.root===bass)||matches[0]||null;
  }
  const api = {chords,naturals,names,reduce,rootLabel,notes,spell,noteName,chordForCode,wheelIndex,detect};
  if(typeof module !== 'undefined' && module.exports) module.exports=api;
  else scope.Music=api;
})(typeof window !== 'undefined' ? window : globalThis);
