/* The recorder follows the final audio mix; no microphone permission is needed. */
'use strict';
(()=>{
  const button=$('record-toggle'),label=$('record-label'),timer=$('record-time');
  const dialog=$('recording-dialog'),preview=$('recording-preview'),last=$('record-last');
  let shownTake=null,takeURL=null,previousState='idle',downloaded=false;
  const duration=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  const recorder=new PerformanceRecorder(engine,()=>{
    const active=recorder.state==='recording',busy=recorder.state==='starting'||recorder.state==='finishing';
    button.disabled=busy;button.setAttribute('aria-pressed',String(active));
    button.setAttribute('aria-label',active?'Stop recording':'Start recording');
    label.textContent=active?'Stop recording':recorder.state==='starting'?'Preparing…':recorder.state==='finishing'?'Saving…':'Record';
    timer.hidden=!active;timer.value=duration(recorder.seconds);
    button.classList.toggle('is-recording',active);
    last.hidden=!shownTake;last.disabled=active||busy;
    if(recorder.state!==previousState){
      $('recording-status').textContent=active?'Recording started. Play your MIDI keyboard.':recorder.state==='idle'&&previousState!=='idle'?'Recording stopped.':'';
      previousState=recorder.state;
    }
    if(recorder.take&&recorder.take!==shownTake){
      shownTake=recorder.take;downloaded=false;
      preview.pause();preview.removeAttribute('src');preview.load();
      if(takeURL)URL.revokeObjectURL(takeURL);
      takeURL=URL.createObjectURL(shownTake.blob);preview.src=takeURL;
      const rate=shownTake.sampleRate/1000;
      $('recording-details').textContent=`${duration(shownTake.seconds)} · Stereo WAV · 24-bit / ${rate} kHz`;
      $('recording-size').textContent=`${(shownTake.blob.size/1024/1024).toFixed(1)} MB`;
      const date=shownTake.startedAt,pad=n=>String(n).padStart(2,'0');
      const stamp=`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
      $('recording-download').href=takeURL;$('recording-download').download=`OKeys-${stamp}.wav`;
      $('recording-warning').textContent=recorder.warning;$('recording-warning').hidden=!recorder.warning;
      last.hidden=false;
      if(!dialog.open)dialog.showModal();
      $('recording-status').textContent='Your recording is ready to preview and download.';
    }else if(recorder.state==='idle'&&recorder.warning)notify(recorder.warning);
  });
  button.onclick=async()=>{
    if(recorder.state==='recording'){await recorder.stop();return;}
    if(recorder.state!=='idle')return;
    preview.pause();dialog.close();
    try{await recorder.start();}catch(error){notify('Could not record: '+error.message);}
  };
  last.onclick=()=>dialog.showModal();
  $('recording-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>preview.pause());
  $('recording-download').onclick=()=>{downloaded=true;};
  window.addEventListener('beforeunload',event=>{
    if(recorder.state!=='idle'||(shownTake&&!downloaded)){event.preventDefault();event.returnValue='';}
  });
  window.addEventListener('pagehide',()=>{
    preview.pause();if(recorder.state==='recording')void recorder.stop('interrupted');
  });
})();
