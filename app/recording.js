(function(scope){
  'use strict';
  // Self-contained for local modules, including direct-file offline launch.
  function installRecorder(){
    class PCMRecorder extends AudioWorkletProcessor {
      constructor(options){
        super();
        this.maxFrames=options.processorOptions.maxFrames;
        this.frames=0;this.used=0;this.active=true;this.started=false;
        this.bytes=new Uint8Array(4096*6);
        this.port.onmessage=event=>{if(event.data==='stop')this.finish('stopped');};
      }
      flush(){
        if(!this.used)return;
        const buffer=this.bytes.buffer.slice(0,this.used);
        this.port.postMessage({type:'chunk',buffer,frames:this.frames},[buffer]);
        this.used=0;
      }
      finish(reason){
        if(!this.active)return;
        this.active=false;this.flush();
        this.port.postMessage({type:'done',reason,frames:this.frames});
      }
      process(inputs,outputs){
        if(!this.active)return false;
        if(!this.started){this.started=true;this.port.postMessage({type:'started'});}
        const input=inputs[0],length=outputs[0][0].length;
        // This branch outputs silence; the existing speaker connection stays untouched.
        for(let i=0;i<length&&this.frames<this.maxFrames;i++){
          for(let channel=0;channel<2;channel++){
            const value=input[channel]?.[i]??input[0]?.[i]??0;
            const sample=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
            const pcm=Math.round(sample*(sample<0?8388608:8388607));
            this.bytes[this.used++]=pcm&255;
            this.bytes[this.used++]=(pcm>>8)&255;
            this.bytes[this.used++]=(pcm>>16)&255;
          }
          this.frames++;
          if(this.used===this.bytes.length)this.flush();
        }
        if(this.frames>=this.maxFrames)this.finish('limit');
        return this.active;
      }
    }
    registerProcessor('okeys-pcm-recorder',PCMRecorder);
  }

  function wavHeader(frames,sampleRate){
    const buffer=new ArrayBuffer(44),view=new DataView(buffer),size=frames*6;
    const word=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
    word(0,'RIFF');view.setUint32(4,36+size,true);word(8,'WAVE');word(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
    view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*6,true);
    view.setUint16(32,6,true);view.setUint16(34,24,true);word(36,'data');view.setUint32(40,size,true);
    return buffer;
  }

  class PerformanceRecorder {
    constructor(engine,onChange=()=>{}){
      this.engine=engine;this.onChange=onChange;this.state='idle';this.take=null;
      this.frames=0;this.maxSeconds=15*60;this.modules=new WeakMap();
    }
    get seconds(){return this.frames/(this.engine.context?.sampleRate||48000);}
    changed(){this.onChange(this);}
    async prepare(context){
      if(!context.audioWorklet||!scope.AudioWorkletNode)throw new Error('Recording needs a recent Chrome or Edge. Open OKeys with its launcher.');
      if(!this.modules.has(context)){
        const source='('+installRecorder.toString()+')();';
        // file:// has an opaque origin in Chromium; its blob:null modules fail CORS.
        const directFile=scope.location?.protocol==='file:';
        const url=directFile?'data:text/javascript;charset=utf-8,'+encodeURIComponent(source):
          URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
        const ready=context.audioWorklet.addModule(url).finally(()=>{if(!directFile)URL.revokeObjectURL(url);});
        this.modules.set(context,ready);
        ready.catch(()=>this.modules.delete(context));
      }
      await this.modules.get(context);
    }
    async start(){
      if(this.state!=='idle')return;
      this.state='starting';this.frames=0;this.warning='';this.changed();
      try{
        const context=await this.engine.unlock();
        await this.prepare(context);
        if(context.state!=='running')throw new Error('Audio is paused. Click Record again to resume.');
        this.chunks=[];this.startedAt=new Date();
        const node=new scope.AudioWorkletNode(context,'okeys-pcm-recorder',{
          numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:2,channelCountMode:'explicit',
          processorOptions:{maxFrames:Math.floor(Math.min(this.maxSeconds*context.sampleRate,256*1024*1024/6))}
        });
        this.node=node;
        await new Promise((resolve,reject)=>{
          this.startReject=reject;
          this.startTimer=setTimeout(()=>reject(new Error('The recorder could not start. Resume audio and try again.')),5000);
          node.port.onmessage=({data})=>{
            if(this.node!==node)return;
            if(data.type==='started'){
              clearTimeout(this.startTimer);this.startReject=null;
              this.state='recording';this.changed();resolve();
            }else if(data.type==='chunk'){
              this.chunks.push(new Blob([data.buffer]));this.frames=data.frames;this.changed();
            }else if(data.type==='done')this.finish(data.reason);
          };
          node.onprocessorerror=()=>{
            if(this.startReject)this.startReject(new Error('The recorder could not start. Please try again.'));
            else this.finish('interrupted');
          };
          node.connect(context.destination);
          this.engine.output.connect(node);
        });
        this.onContextChange=()=>{if(context.state!=='running'&&this.state==='recording')void this.stop('interrupted');};
        context.addEventListener('statechange',this.onContextChange);
      }catch(error){
        this.cleanup();this.state='idle';this.changed();throw error;
      }
    }
    stop(reason='stopped'){
      if(this.state==='finishing')return this.stopping;
      if(this.state!=='recording')return Promise.resolve(this.take);
      this.state='finishing';this.stopReason=reason;this.changed();
      this.stopping=new Promise(resolve=>{this.stopResolve=resolve;});
      // A disconnected/interrupted device may stop its worklet thread. Keep every
      // delivered PCM chunk rather than leaving the take or controls stuck forever.
      this.stopTimer=setTimeout(()=>this.finish('interrupted'),2000);
      this.node.port.postMessage('stop');
      return this.stopping;
    }
    finish(reason){
      if(!this.node)return;
      if(this.stopReason==='interrupted')reason='interrupted';
      const sampleRate=this.engine.context.sampleRate;
      if(this.frames){
        this.take={blob:new Blob([wavHeader(this.frames,sampleRate),...this.chunks],{type:'audio/wav'}),
          seconds:this.seconds,sampleRate,startedAt:this.startedAt,reason};
      }
      this.warning=reason==='limit'?'The recording reached its size or 15-minute limit. Your take is ready to download.':
        reason==='interrupted'?'Audio was interrupted. The captured part of your take is ready to download.':
        !this.frames?'No audio was captured. Please try recording again.':'';
      const resolve=this.stopResolve;
      this.cleanup();this.state='idle';this.changed();resolve?.(this.take);
    }
    cleanup(){
      clearTimeout(this.startTimer);clearTimeout(this.stopTimer);
      if(this.onContextChange)this.engine.context.removeEventListener('statechange',this.onContextChange);
      this.onContextChange=null;
      if(this.node){
        this.node.port.postMessage('stop');
        try{this.engine.output.disconnect(this.node);}catch{}
        this.node.disconnect();this.node.port.onmessage=null;this.node.port.close();this.node.onprocessorerror=null;
      }
      this.node=null;this.chunks=[];this.startReject=null;this.stopResolve=null;this.stopping=null;this.stopReason=null;
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={PerformanceRecorder,wavHeader,installRecorder};
  else scope.PerformanceRecorder=PerformanceRecorder;
})(typeof window!=='undefined'?window:globalThis);
