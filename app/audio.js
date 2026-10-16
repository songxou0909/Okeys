(function(scope){
  'use strict';
  class AudioEngine {
    constructor(onChange,detectChord=()=>null){this.context=null;this.voices=new Map();this.sustains=new Set();this.autoSustain=false;this.detectChord=detectChord;this.volume=.65;this.onChange=onChange;this.muteApp=false;this.serial=0;this.instrument='grand';this.samples=new Map();this.guitarBuffers=new Map();this.saxWaves=new Map();}
    init(){
      if(!this.context){
        const Ctx=scope.AudioContext || scope.webkitAudioContext;
        if(!Ctx) throw new Error('This browser does not support Web Audio. Try Edge or Chrome.');
        this.context=new Ctx({latencyHint:'interactive'});
        this.master=this.context.createGain();this.master.gain.value=this.volume*1.5;
        // Memoryless peak guard: no look-ahead, oversampling, convolution or delay.
        // Reserve 8x internal headroom, then smoothly limit only peaks above .75.
        const headroom=this.context.createGain(),guard=this.context.createWaveShaper();
        headroom.gain.value=.125;
        guard.curve=Float32Array.from({length:8193},(_,i)=>{const x=(i/8192*2-1)*8,a=Math.abs(x);return Math.sign(x)*(a<=.75?a:.75+.25*Math.tanh((a-.75)/.25));});
        this.master.connect(headroom);headroom.connect(guard);guard.connect(this.context.destination);
        // Recording taps the same guarded mix as the speakers, without delaying playback.
        this.output=guard;
        // An input-connected analyser with no output is an automatic-pull node.
        // In Chromium's interactive mode this keeps the real audio device warm
        // through silence instead of switching to its delayed silent sink.
        // It adds no signal to the speakers and needs no main-thread polling.
        this.keepAlive=this.context.createAnalyser();this.keepAlive.fftSize=32;
        this.master.connect(this.keepAlive);
        const real=new Float32Array(17),imag=new Float32Array(17);
        for(let i=1;i<17;i++) imag[i]=1/Math.pow(i,1.85);
        this.wave=this.context.createPeriodicWave(real,imag);
      }
    }
    async unlock(){
      this.init();
      if(this.context.state!=='running') await this.context.resume();
      this.onChange();return this.context;
    }
    // Partial inverse A-weighting, relative to C4, bounded to -8 / +12 dB.
    // A practical register balance, not a calibrated equal-loudness measurement.
    static balance(note){
      const a=f=>{const q=f*f;return 2+20*Math.log10(12200**2*q*q/((q+20.6**2)*(q+12200**2)*Math.sqrt((q+107.7**2)*(q+737.9**2))));};
      return 10**(Math.max(-8,Math.min(12,.55*(a(261.625565)-a(440*2**((note-69)/12)))))/20);
    }
    async preload(bundle){
      this.init();
      const loaded=await Promise.all(Object.entries(bundle).map(async([note,encoded])=>{
        const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
        const buffer=await this.context.decodeAudioData(bytes.buffer);
        const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
        let offset=0;
        // Remove only leading digital silence; preserve the hammer transient.
        while(offset<buffer.length&&channels.every(c=>Math.abs(c[offset])<.0003))offset++;
        offset=Math.max(0,offset-Math.round(buffer.sampleRate*.001));
        const step=Math.max(1,Math.round(buffer.sampleRate*.02)),envelope=[];
        for(let i=offset;i<buffer.length;i+=step){let sum=0,count=0;for(const c of channels)for(let j=i;j<Math.min(i+step,buffer.length);j++){sum+=c[j]*c[j];count++;}envelope.push(Math.sqrt(sum/count));}
        const attack=Math.max(.001,...envelope.slice(0,25));
        return [Number(note),{buffer,offset:offset/buffer.sampleRate,envelope,attack,normalization:Math.min(8,.12/attack)}];
      }));
      this.samples=new Map(loaded);this.guitarMixGains?.clear();this.onChange();
    }
    setVolume(value){this.volume=Math.max(0,Math.min(1,value));if(this.context){const now=this.context.currentTime;this.master.gain.cancelScheduledValues(now);if(this.volume===0)this.master.gain.setValueAtTime(0,now);else this.master.gain.setTargetAtTime(this.volume*1.5,now,.01);}}
    guitarBuffer(note){
      if(this.guitarBuffers.has(note))return this.guitarBuffers.get(note);
      const rate=this.context.sampleRate,frequency=440*2**((note-69)/12);
      const buffer=this.context.createBuffer(1,Math.ceil(rate*6),rate),data=buffer.getChannelData(0);
      // Fractional-delay Karplus–Strong string. The half-sample compensation
      // offsets the averaging filter's phase delay, keeping fretted notes in tune.
      const delay=rate/frequency-.5,whole=Math.floor(delay),fraction=delay-whole;
      let seed=note*12345+1,previous=0,peak=0;
      for(let i=0;i<data.length;i++){
        if(i<=whole+1){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}
        else{const delayed=data[i-whole]*(1-fraction)+data[i-whole-1]*fraction;data[i]=.499*(delayed+previous);previous=delayed;}
        // Short pick attack, then a natural ringing string with a soft final fade.
        peak=Math.max(peak,Math.abs(data[i]));
      }
      for(let i=0;i<data.length;i++)data[i]=data[i]/Math.max(.01,peak)*Math.min(1,i/(rate*.002),(data.length-i)/(rate*.1));
      this.guitarBuffers.set(note,buffer);return buffer;
    }
    startInstrument(voice,now){
      const context=this.context,gain=context.createGain(),frequency=440*2**((voice.note-69)/12);
      let osc;const extra=[],sources=[];
      if(voice.instrument==='guitar'){
        osc=context.createBufferSource();osc.buffer=this.guitarBuffer(voice.note);
        // Match the piano/sax output range; the old 2.8x boost made a
        // five/six-string chord much louder and drove the output limiter.
        gain.gain.setValueAtTime(voice.peak,now);
        const body=context.createBiquadFilter();body.type='peaking';body.frequency.value=180;body.Q.value=.8;body.gain.value=3;
        osc.connect(body);body.connect(gain);extra.push(body);
      }else{
        osc=context.createOscillator();
        if(!this.saxWaves.has(voice.note)){
          const real=new Float32Array(49),imag=new Float32Array(49);
          for(let h=1;h<49;h++){const f=h*frequency;imag[h]=(h%2?1:.82)/h**.85*(.55+1.7*Math.exp(-(((f-1200)/850)**2))+.7*Math.exp(-(((f-2600)/1200)**2)));}
          this.saxWaves.set(voice.note,context.createPeriodicWave(real,imag));
        }
        osc.setPeriodicWave(this.saxWaves.get(voice.note));osc.frequency.value=frequency;
        const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(Math.min(9000,1800+frequency*3),now);filter.Q.value=.65;
        osc.connect(filter);filter.connect(gain);extra.push(filter);
        const vibrato=context.createOscillator(),depth=context.createGain();vibrato.frequency.value=5.2;
        depth.gain.setValueAtTime(0,now);depth.gain.setValueAtTime(0,now+.18);depth.gain.linearRampToValueAtTime(frequency*.005,now+.4);
        vibrato.connect(depth);depth.connect(osc.frequency);vibrato.start(now);sources.push(vibrato);extra.push(depth);
        gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(voice.peak*.75,now+.035);gain.gain.linearRampToValueAtTime(voice.peak*.6,now+.12);
      }
      gain.connect(this.master);osc.start(now);
      osc.onended=()=>{for(const source of sources){source.stop();source.disconnect();}for(const node of extra)node.disconnect();osc.disconnect();gain.disconnect();voice.ended=true;if(!voice.held&&this.voices.get(voice.id)===voice)this.voices.delete(voice.id);this.onChange();};
      voice.osc=osc;voice.gain=gain;
    }
    guitarChordGain(notes,referenceNotes){
      // Match the first second of the strummed voicing to the corresponding
      // piano chord. Cache each shape; neither the volume slider nor velocity
      // is baked into this trim. This accounts for bass register and string count.
      this.guitarMixGains??=new Map();const key=notes.join(',')+'/'+referenceNotes.join(',');
      if(this.guitarMixGains.has(key))return this.guitarMixGains.get(key);
      const strings=notes.map((note,i)=>({data:this.guitarBuffer(note).getChannelData(0),gain:.22*AudioEngine.balance(note),delay:i*.018}));
      const piano=referenceNotes.map(note=>{
        if(!this.samples.size)return null;
        const nearest=[...this.samples.keys()].reduce((a,b)=>Math.abs(a-note)<Math.abs(b-note)?a:b),sample=this.samples.get(nearest);
        return {data:sample.buffer.getChannelData(0),sampleRate:sample.buffer.sampleRate,offset:sample.offset,rate:2**((note-nearest)/12),gain:AudioEngine.balance(note)*sample.normalization};
      }).filter(Boolean);
      const read=(data,index)=>{const i=Math.floor(index),f=index-i;return (data[i]||0)*(1-f)+(data[i+1]||0)*f;};
      let guitarEnergy=0,pianoEnergy=0;const points=12000;
      for(let i=0;i<points;i++){
        const time=i/points;
        const guitar=strings.reduce((sum,s)=>sum+(time<s.delay?0:read(s.data,(time-s.delay)*this.context.sampleRate)*s.gain),0);
        const reference=piano.reduce((sum,s)=>sum+read(s.data,(s.offset+time*s.rate)*s.sampleRate)*s.gain,0);
        guitarEnergy+=guitar*guitar;pianoEnergy+=reference*reference;
      }
      const target=piano.length?pianoEnergy:points*.065**2;
      // The guitar body EQ adds some energy after the string model.
      const trim=Math.max(.08,Math.min(2,Math.sqrt(target/Math.max(1e-9,guitarEnergy))*.88));
      this.guitarMixGains.set(key,trim);return trim;
    }
    start(id,note,velocity=100,source='app',channel='app',outputScale=1){
      // Caller unlocks audio during the connect/play gesture. MIDI note-on executes synchronously.
      if(this.voices.has(id))this.remove(id,true);
      // Inspect the incoming note before sounding it. No look-ahead delay is added:
      // MIDI chords become known when enough finger-held notes have arrived.
      if(this.autoSustain&&channel!=='chord'){
        const held=[...this.voices.values()].filter(v=>v.source===source&&v.channel===channel&&v.held).map(v=>v.note);
        if(this.detectChord([...held,note]))this.beginChord(source,channel);
      }
      const peak=.22*Math.pow(Math.max(1,velocity)/127,1.5)*AudioEngine.balance(note)*outputScale;
      const voice={id,note,source,channel,held:true,sustained:false,serial:++this.serial,startedAt:this.context?.currentTime||0,peak,ended:false,instrument:this.instrument};
      this.voices.set(id,voice);
      if(this.context && this.context.state==='running' && !(this.muteApp && source==='app')){
        const now=this.context.currentTime;
        if(this.instrument==='guitar'||this.instrument==='saxophone')this.startInstrument(voice,now);
        else{
        const sampleNote=this.instrument==='grand'&&this.samples.size?[...this.samples.keys()].reduce((best,n)=>Math.abs(n-note)<Math.abs(best-note)?n:best):null;
        const sample=sampleNote===null?null:this.samples.get(sampleNote);
        const osc=sample?this.context.createBufferSource():this.context.createOscillator(),gain=this.context.createGain();
        if(sample){
          const rate=2**((note-sampleNote)/12);osc.buffer=sample.buffer;osc.playbackRate.value=rate;
          voice.sample=sample;voice.rate=rate;
          gain.gain.setValueAtTime(peak/.22*sample.normalization,now);
          osc.connect(gain);gain.connect(this.master);osc.start(now,sample.offset);
        }else{
        osc.setPeriodicWave(this.wave);osc.frequency.value=440*Math.pow(2,(note-69)/12);
        gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(peak,now+.002);
        gain.gain.exponentialRampToValueAtTime(Math.max(.0001,peak*.28),now+1.2);
        gain.gain.exponentialRampToValueAtTime(.0001,now+18);
        osc.connect(gain);gain.connect(this.master);osc.start(now);osc.stop(now+18);
        }
        osc.onended=()=>{osc.disconnect();gain.disconnect();voice.ended=true;if(!voice.held&&this.voices.get(id)===voice)this.voices.delete(id);this.onChange();};
        voice.osc=osc;voice.gain=gain;
        }
      }
      if(this.voices.size>128){const oldest=this.voices.keys().next().value;this.remove(oldest,true);}
      this.onChange();return voice;
    }
    // Match the exact audio envelope, normalized to this note's attack amplitude.
    // Finger-held keys stay solid; this level controls only pedal-held highlights.
    level(voice,now=this.context?.currentTime||0){
      if(voice.silencedAt!=null)return voice.silenceLevel*Math.max(0,1-(now-voice.silencedAt)/voice.silenceDuration);
      const age=Math.max(0,now-voice.startedAt);
      if(voice.instrument==='guitar')return voice.ended||age>=6?0:Math.exp(-age*1.5);
      if(voice.instrument==='saxophone')return voice.ended?0:voice.releasedAt!=null?Math.max(0,1-(now-voice.releasedAt)/1.5):Math.min(1,age/.035);
      if(voice.sample){const s=voice.sample,index=age*voice.rate/.02,i=Math.floor(index);if(voice.ended||i>=s.envelope.length)return 0;const rms=(s.envelope[i]||0)*(1-(index-i))+(s.envelope[i+1]||0)*(index-i);return Math.max(0,Math.min(1,(rms/s.attack-.001)/.999));}
      if(voice.ended||age>=18)return 0;
      if(age<.002)return age/.002;
      const decay=Math.max(.0001,voice.peak*.28);
      const amplitude=age<=1.2?voice.peak*Math.pow(decay/voice.peak,(age-.002)/1.198):decay*Math.pow(.0001/decay,(age-1.2)/16.8);
      return Math.max(0,Math.min(1,(amplitude-.0001)/(voice.peak-.0001)));
    }
    release(id){
      const v=this.voices.get(id);if(!v||!v.held)return;v.held=false;
      if((this.autoSustain||this.sustains.has(v.channel))&&!v.ended){
        v.sustained=true;
        // Reeds do not have a recorded/plucked decay: give released breath a finite tail.
        if(v.instrument==='saxophone'){
          v.releasedAt=this.context?.currentTime||0;
          if(v.osc){v.gain.gain.cancelAndHoldAtTime(v.releasedAt);v.gain.gain.linearRampToValueAtTime(0,v.releasedAt+1.5);v.osc.stop(v.releasedAt+1.51);}
        }
        this.onChange();
      }else this.remove(id);
    }
    setAutoSustain(enabled){
      this.autoSustain=!!enabled;
      // Return to the actual pedal state, including pedal changes made in auto mode.
      if(!this.autoSustain)for(const [id,v] of this.voices)if(!v.held&&!this.sustains.has(v.channel))this.remove(id);
      this.onChange();
    }
    beginChord(source='app',channel='chord'){
      if(!this.autoSustain)return;
      for(const [id,v] of this.voices)if(!v.held&&v.source===source&&(source==='app'||v.channel===channel))this.remove(id,true);
    }
    silence(voice,fast=false){
      const now=this.context?.currentTime||0,tail=fast?.012:.12;
      voice.silenceLevel=voice.held?1:this.level(voice,now);voice.silencedAt=now;voice.silenceDuration=tail;
      if(!voice.osc)return;
      voice.gain.gain.cancelAndHoldAtTime(now);voice.gain.gain.linearRampToValueAtTime(0,now+tail);voice.osc.stop(now+tail+.005);voice.osc=null;
    }
    remove(id,fast=false){const v=this.voices.get(id);if(!v)return;this.silence(v,fast);this.voices.delete(id);this.onChange();}
    pedal(channel,down){if(down)this.sustains.add(channel);else{this.sustains.delete(channel);if(!this.autoSustain)for(const [id,v] of this.voices)if(v.channel===channel&&!v.held)this.remove(id);}this.onChange();}
    stopChannel(channel){this.sustains.delete(channel);for(const [id,v] of this.voices)if(v.channel===channel)this.remove(id,true);this.onChange();}
    stopSource(source){for(const [id,v] of this.voices)if(v.source===source)this.remove(id,true);}
    setMuted(muted){this.muteApp=muted;if(muted)for(const v of this.voices.values())if(v.source==='app')this.silence(v,true);this.onChange();}
    panic(){this.sustains.clear();for(const id of [...this.voices.keys()])this.remove(id,true);this.onChange();}
    midi(data,device='midi'){
      const [status,note,value=0]=data,command=status&0xf0,channel=device+':'+(status&15),id=channel+':'+note;
      if(command===0x90 && value>0)this.start(id,note,value,'midi',channel);
      else if(command===0x80 || (command===0x90&&value===0))this.release(id);
      else if(command===0xb0){if(note===64)this.pedal(channel,value>=64);else if(note===120||note===123)this.stopChannel(channel);else if(note===121)this.pedal(channel,false);}
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=AudioEngine;else scope.AudioEngine=AudioEngine;
})(typeof window!=='undefined'?window:globalThis);
