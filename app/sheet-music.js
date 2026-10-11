(function(scope){
  'use strict';
  const pitch={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const sharp=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const flat=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const suffix='(?:(?:maj|min|dim|aug|sus|add|m|M|Δ|ø|°|\\+|-)?(?:2|4|5|6|7|9|11|13)?(?:(?:sus|add|no)(?:2|3|4|5|6|7|9|11|13)|[#b♯♭](?:5|9|11|13)|\\((?:[#b♯♭]?(?:5|6|7|9|11|13))(?:,[#b♯♭]?(?:5|6|7|9|11|13))*\\))*)';
  const pattern=new RegExp('^([A-G])([#b♯♭]?)('+suffix+')(?:/\\s*([A-G])([#b♯♭]?))?$');
  function parseChord(value){return pattern.exec(value);}
  function transpose(value,steps){
    const m=parseChord(value);if(!m||steps===0)return value;
    const names=/[b♭]/.test(m[2]+(m[5]||''))?flat:sharp;
    const note=(letter,accidental)=>names[((pitch[letter]+(['#','♯'].includes(accidental)?1:['b','♭'].includes(accidental)?-1:0)+steps)%12+12)%12];
    return note(m[1],m[2])+m[3]+(m[4]?'/'+note(m[4],m[5]):'');
  }
  function wheelChord(value){
    const m=parseChord(value);if(!m)return null;
    let quality=m[3].replaceAll('♭','b').replaceAll('♯','#').replace(/[(),]/g,'');
    quality=quality.replace(/^min/,'m').replace(/^-/,'m').replace(/^(M|Δ)/,'maj').replace(/^°/,'dim');
    const aliases={'':'major',maj:'major',m:'minor',mb5:'dim',sus:'sus4',aug:'aug','+':'aug',ø:'m7b5',ø7:'m7b5'};
    quality=aliases[quality]||quality;
    return {root:m[1],accidental:['#','♯'].includes(m[2])?1:['b','♭'].includes(m[2])?-1:0,id:quality,bass:m[4]?pitch[m[4]]+(['#','♯'].includes(m[5])?1:['b','♭'].includes(m[5])?-1:0):null,symbol:value};
  }
  // Require chord-dominated lines, or explicit [Chord] markup in lyric lines.
  // This keeps isolated A / Am / C letters in prose and headings unchanged.
  function chordRanges(line){
    // Mask only known section/performance annotations next to measure bars.
    // Preserve every character offset for PDF glyph ranges and TXT overlays.
    const blank=text=>' '.repeat(text.length);
    const notation=line.replace(/^\s*(?:intro|interlude|outro|verse|chorus|bridge)\s*[:：]?\s*(?=[|｜])/iu,blank)
      .replace(/[|｜]\s*(?:rit\.*|\(drum\s+fills?\))\s*$/iu,blank);
    const candidates=[];
    const re=/[^\s|｜:;\[\]{}]+/gu;let m;
    while((m=re.exec(notation))){let value=m[0],start=m.index;
      // An attached slash may have whitespace before its bass: F#7/ Bb.
      // A detached /D remains an independent chord, as before.
      if(value.endsWith('/')){
        const bass=/^\s+[A-G][#b♯♭]?(?=$|[\s|｜:;\[\]{}])/u.exec(notation.slice(re.lastIndex));
        if(bass){value+=bass[0];re.lastIndex+=bass[0].length;}
      }
      // Hold marks and full-width measure bars are notation, not chord quality.
      value=value.replace(/[~～]+$/u,'');
      if(value.startsWith('(')&&value.endsWith(')')){value=value.slice(1,-1);start++;}
      // Rhythm dashes may touch the next chord, as in "-C#/F".
      const leading=/^[-－–—]+(?=[A-G])/.exec(value)?.[0]||'';
      start+=leading.length;value=value.slice(leading.length);
      // A detached /D means an independent D chord. Leave the printed slash
      // outside the target; only an attached G/D carries a slash bass.
      if(/^\/[A-G][#b♯♭]?$/.test(value)){start++;value=value.slice(1);}
      if(parseChord(value))candidates.push({start,end:start+value.length,value});
    }
    let rest=notation;for(const c of [...candidates].reverse())rest=rest.slice(0,c.start)+rest.slice(c.end);
    const chordLine=candidates.length>0&&!rest.replace(/\b[xX]\s*\d+\b/gu,'').replace(/[\s/|｜:;()[\]{}%.,．*＊~～\-－–—×\d]/gu,'');
    return candidates.filter(c=>chordLine||(line[c.start-1]==='['&&line[c.end]===']')).sort((a,b)=>a.start-b.start);
  }
  function decodeText(buffer){
    const bytes=new Uint8Array(buffer);
    if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes);
    if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes);
    try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('big5').decode(bytes);}
  }
  class SpaceGesture{
    constructor({next,previous,hold,setTimer=(fn,delay)=>setTimeout(fn,delay),clearTimer=id=>clearTimeout(id)}){Object.assign(this,{next,previous,hold,setTimer,clearTimer});this.down=false;this.held=false;this.tap=null;this.timer=null;}
    press(){if(this.down)return;this.down=true;this.held=false;this.secondTap=this.tap!==null;this.clearTimer(this.tap);this.tap=null;this.timer=this.setTimer(()=>{this.timer=null;this.held=true;this.secondTap=false;this.hold(true);},300);}
    release(){if(!this.down)return;this.down=false;this.clearTimer(this.timer);this.timer=null;if(this.held){this.held=false;this.hold(false);return;}if(this.secondTap){this.secondTap=false;this.previous();}else this.tap=this.setTimer(()=>{this.tap=null;this.next();},260);}
    cancel(){this.clearTimer(this.timer);this.clearTimer(this.tap);this.timer=this.tap=null;this.down=this.held=this.secondTap=false;this.hold(false);}
  }
  const api={parseChord,transpose,wheelChord,chordRanges,decodeText,SpaceGesture};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.SheetMusic=api;
})(typeof window!=='undefined'?window:globalThis);
