(function(scope){
  'use strict';
  const tuning=[40,45,50,55,59,64],cache=new Map();
  // Conventional open chords precede movable grips and the search fallback.
  // Finger arrays run from low E to high E (0=open, -1=muted).
  const open={
    '0:major':[[-1,3,2,0,1,0],[-1,3,2,0,1,0]],
    '2:major':[[-1,-1,0,2,3,2],[-1,-1,0,1,3,2]],
    '4:major':[[0,2,2,1,0,0],[0,2,3,1,0,0]],
    '7:major':[[3,2,0,0,0,3],[2,1,0,0,0,3]],
    '9:major':[[-1,0,2,2,2,0],[-1,0,1,2,3,0]],
    '2:minor':[[-1,-1,0,2,3,1],[-1,-1,0,2,3,1]],
    '4:minor':[[0,2,2,0,0,0],[0,2,3,0,0,0]],
    '9:minor':[[-1,0,2,2,1,0],[-1,0,2,3,1,0]],
    '0:7':[[-1,3,2,3,1,0],[-1,3,2,4,1,0]],
    '2:7':[[-1,-1,0,2,1,2],[-1,-1,0,2,1,3]],
    '4:7':[[0,2,0,1,0,0],[0,2,0,1,0,0]],
    '7:7':[[3,2,0,0,0,1],[3,2,0,0,0,1]],
    '9:7':[[-1,0,2,0,2,0],[-1,0,1,0,2,0]],
    '11:7':[[-1,2,1,2,0,2],[-1,2,1,3,0,4]],
    '0:maj7':[[-1,3,2,0,0,0],[-1,3,2,0,0,0]],
    '2:maj7':[[-1,-1,0,2,2,2],[-1,-1,0,1,1,1]],
    '9:maj7':[[-1,0,2,1,2,0],[-1,0,2,1,3,0]],
    '2:m7':[[-1,-1,0,2,1,1],[-1,-1,0,2,1,1]],
    '4:m7':[[0,2,0,0,0,0],[0,2,0,0,0,0]],
    '9:m7':[[-1,0,2,0,1,0],[-1,0,2,0,1,0]]
  };
  const eShapes={major:[0,2,2,1,0,0],minor:[0,2,2,0,0,0],'7':[0,2,0,1,0,0],m7:[0,2,0,0,0,0],maj7:[0,-1,1,1,0,-1],
    '6':[0,2,2,1,2,0],m6:[0,2,2,0,2,0],dim:[0,1,2,0,-1,-1],dim7:[0,1,2,0,2,0],aug:[0,3,2,1,1,0],sus4:[0,2,2,2,0,0],
    '7sus4':[0,2,0,2,0,0],m7b5:[0,1,0,0,3,-1],'7b5':[0,1,0,1,-1,-1],'7#5':[0,3,0,1,1,0],
    '9':[0,2,0,1,0,2],m9:[0,2,0,0,0,2],maj9:[0,2,1,1,0,2],add9:[0,2,4,1,0,0],'7b9':[0,2,0,1,0,1]};
  const aShapes={major:[-1,0,2,2,2,0],minor:[-1,0,2,2,1,0],'7':[-1,0,2,0,2,0],m7:[-1,0,2,0,1,0],maj7:[-1,0,2,1,2,0],
    '6':[-1,0,2,2,2,2],m6:[-1,0,2,2,1,2],dim:[-1,0,1,2,1,-1],dim7:[-1,0,1,2,1,2],aug:[-1,0,3,2,2,1],
    sus4:[-1,0,2,2,3,0],sus2:[-1,0,2,2,0,0],'7sus4':[-1,0,2,0,3,0],m7b5:[-1,0,1,0,1,-1],'7b5':[-1,0,1,0,2,-1],
    '7#5':[-1,0,3,0,2,1],'9':[-1,0,2,4,2,3],m9:[-1,0,2,4,1,3],maj9:[-1,0,2,4,2,4],add9:[-1,0,2,4,2,0],'7b9':[-1,0,2,3,2,3]};
  // Compact extended voicings leave out nonessential tones, as indicated in UI.
  const jazz={
    '9':[0,[-1,3,2,3,3,3]],'7#9':[4,[-1,7,6,7,8,-1]],
    '11':[0,[-1,3,3,3,3,3]],m11:[4,[0,2,0,2,0,3]],
    '13':[4,[0,-1,0,1,2,2]],m13:[4,[0,-1,0,0,2,2]],maj13:[4,[0,-1,1,1,2,2]]
  };
  function fingerGroups(frets,numbers){
    return [...new Set(numbers.filter(n=>n>0))].sort().map(finger=>{
      const strings=numbers.flatMap((n,i)=>n===finger?[i]:[]);
      return {finger,strings,fret:frets[strings[0]]};
    });
  }
  // Group same-fret notes only when a barre can cross the intervening strings.
  function fingers(frets){
    let groups=frets.map((fret,string)=>({fret,strings:[string]})).filter(g=>g.fret>0).sort((a,b)=>a.fret-b.fret);
    // Merge only as many fingers as necessary, starting with the index barre.
    // Higher equal-fret strings normally use separate ring and little fingers.
    for(const fret of [...new Set(groups.map(g=>g.fret))]){
      if(groups.length<=4)break;
      const strings=groups.filter(g=>g.fret===fret).flatMap(g=>g.strings);
      const runs=[];let run=[];
      for(const string of strings){
        if(run.length&&frets.slice(run[0],string).some(f=>f<fret)){runs.push(run);run=[];}
        run.push(string);
      }
      runs.push(run);
      for(const strings of runs){
        if(groups.length<=4)break;
        if(strings.length<2)continue;
        groups=groups.filter(g=>g.fret!==fret||!strings.includes(g.strings[0]));groups.push({fret,strings});
      }
    }
    return groups.sort((a,b)=>a.fret-b.fret||a.strings[0]-b.strings[0]).map((g,i)=>({...g,finger:i+1}));
  }
  function voicings(root,chord,bass=null){
    root=(root+12)%12;if(bass!=null)bass=(bass+12)%12;
    const baseKey=root+':'+chord.id,key=baseKey+(bass==null?'':'/'+bass);
    if(cache.has(key))return cache.get(key);
    const pitches=[...new Set([...chord.intervals.map(i=>(root+i)%12),...(bass==null?[]:[bass])])],candidates=new Map();
    // Compact extensions retain their defining tones: 9 for ninths, 11 for
    // elevenths, 13 for thirteenths, plus root/third/seventh. Never omit an
    // altered fifth. A dominant 11 may omit its clashing major third.
    const optionalIntervals=[...(chord.intervals.length>3?[7]:[]),...(chord.intervals.some(i=>i>=17)?[14]:[]),...(chord.intervals.some(i=>i>=21)?[17]:[]),...(chord.id==='11'?[4]:[])];
    function consider(frets,priority=2,label='Alternative',numbers=null,allowOmissions=false){
      if(frets.some(f=>f>15))return;
      const sounding=frets.flatMap((f,i)=>f<0?[]:[tuning[i]+f]);
      if(bass!=null&&Math.min(...sounding)%12!==bass)return;
      const missing=pitches.filter(p=>!sounding.some(n=>n%12===p));
      if(sounding.length<3||sounding.some(n=>!pitches.includes(n%12)))return;
      const optional=allowOmissions?optionalIntervals.map(i=>(root+i)%12):pitches.length>6?[(root+7)%12]:[];
      if(missing.some(p=>!optional.includes(p)))return;
      let baseFrets=[...frets],bassStrings=[];
      if(bass!=null&&bass!==root){
        const bassNote=Math.min(...sounding);
        baseFrets=frets.map((f,i)=>f>=0&&tuning[i]+f===bassNote?-1:f);
        bassStrings=frets.flatMap((f,i)=>f>=0&&baseFrets[i]<0?[i]:[]);
        if(!bassStrings.length||bassStrings.some(i=>(tuning[i]+frets[i])%12!==bass))return;
        const baseNotes=baseFrets.flatMap((f,i)=>f<0?[]:[tuning[i]+f]);
        if(baseNotes.some(n=>!chord.intervals.some(interval=>(root+interval)%12===n%12)))return;
        if(baseNotes.length<3||chord.intervals.some(n=>!optional.includes((root+n)%12)&&!baseNotes.some(v=>v%12===(root+n)%12)))return;
      }
      const groups=numbers?fingerGroups(frets,numbers):fingers(frets);if(groups.length>4)return;
      const pressed=frets.filter(f=>f>0),low=pressed.length?Math.min(...pressed):1,high=Math.max(1,...pressed);
      if(high-low>4)return;
      const baseBass=Math.min(...baseFrets.flatMap((f,i)=>f<0?[]:[tuning[i]+f]))%12;
      const score=priority*1000+missing.length*100+low*2+(high-low)*3+groups.length*2+frets.filter(f=>f<0).length*2+(sounding[0]%12===root?0:20)+(bass!=null&&baseBass!==root?30:0);
      const signature=frets.join(',');
      const omittedDegrees=chord.intervals.filter(i=>missing.includes((root+i)%12)).map(i=>chord.degrees[chord.intervals.indexOf(i)]);
      const shape={frets:[...frets],baseFrets,bassStrings,groups,start:high<=4?1:low,omitted:missing[0]??null,omittedDegrees,label,priority,score};
      if(!candidates.has(signature)||candidates.get(signature).score>score)candidates.set(signature,shape);
    }
    if(open[baseKey])consider(open[baseKey][0],0,'Open shape',open[baseKey][1]);
    if(bass!=null){
      // Adapt familiar grips first, then search only this requested inversion.
      for(const shape of voicings(root,chord))for(let string=0;string<4;string++){
        for(let fret=(bass-tuning[string]%12+12)%12;fret<=15;fret+=12){
          const frets=shape.frets.map((f,i)=>i<string?-1:i===string?fret:f);
          consider(frets,0,'Slash bass shape',null,true);
        }
      }
    }
    if(root===5&&chord.id==='major')consider([-1,-1,3,2,1,1],1,'Small barre',[-1,-1,3,2,1,1]);
    for(const [base,shapes,label] of [[4,eShapes,'E shape'],[9,aShapes,'A shape']]){
      if(!shapes[chord.id])continue;
      for(const offset of [(root-base+12)%12,(root-base+12)%12+12]){
        const frets=shapes[chord.id].map(f=>f<0?-1:f+offset);
        // Familiar full barres retain their conventional finger numbers.
        const nums=offset>0&&chord.id==='major'?(base===4?[1,3,4,2,1,1]:[-1,1,3,3,3,1]):
          offset>0&&chord.id==='minor'?(base===4?[1,3,4,1,1,1]:[-1,1,3,4,2,1]):null;
        consider(frets,1,offset===0?'Open shape':label,nums);
      }
    }
    if(jazz[chord.id]){
      const [base,frets]=jazz[chord.id];
      for(const offset of [(root-base+12)%12,(root-base+12)%12-12]){
        if(frets.some(f=>f>=0&&f+offset<0))continue;
        consider(frets.map(f=>f<0?-1:f+offset),1,'Jazz shape',null,true);
      }
    }
    const required=pitches.filter(p=>pitches.length<=6||p!==(root+7)%12);
    for(let start=1;start<=12;start++){
      const options=tuning.map(note=>[-1,...Array.from({length:4},(_,i)=>start+i),...(start===1?[0]:[])].filter(f=>f<0||required.includes((note+f)%12)));
      function search(frets){if(frets.length===6){consider(frets);return;}for(const fret of options[frets.length])search([...frets,fret]);}
      search([]);
    }
    if(bass!=null&&candidates.size<3){
      // Broaden only when needed: a five-fret window and ringing open strings,
      // with explicitly listed conventional omissions for extended chords.
      for(let start=1;start<=11;start++){
        const options=tuning.map(note=>[-1,0,...Array.from({length:5},(_,i)=>start+i)].filter(f=>f<0||pitches.includes((note+f)%12)));
        function search(frets){if(frets.length===6){consider(frets,3,'Compact slash shape',null,true);return;}for(const fret of options[frets.length])search([...frets,fret]);}
        search([]);
      }
    }
    const ranked=[...candidates.values()].sort((a,b)=>a.score-b.score),chosen=[];
    // Prefer useful changes of position over several nearly identical shapes.
    for(const shape of ranked){
      if(chosen.some(other=>shape.frets.filter((f,i)=>f!==other.frets[i]).length<3))continue;
      chosen.push(shape);if(chosen.length===3)break;
    }
    for(const shape of ranked){if(chosen.length===3)break;if(!chosen.includes(shape))chosen.push(shape);}
    cache.set(key,chosen);return chosen;
  }
  function voicing(root,chord){return voicings(root,chord)[0]||null;}
  const api={tuning,voicing,voicings,fingers};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.Guitar=api;
})(globalThis);
