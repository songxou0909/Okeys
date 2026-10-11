/* Local sheet reader. Source documents are rendered as data, never as markup. */
(()=>{
  'use strict';
  const byId=id=>document.getElementById(id),S=window.SheetMusic;
  const viewport=byId('sheet-viewport'),pagesEl=byId('sheet-pages'),panel=byId('sheet-panel');
  let session=null,pages=[],labels=[],steps=0,zoom=1,fit=true,auto=false,holding=false,frame=0,lastTime=0,scrollPosition=0;
  let scrollWritten=0,scrollOffset=0;
  let currentLabel=null;
  function syncScroll(){
    scrollPosition=scrollWritten=viewport.scrollTop;scrollOffset=0;
    pagesEl.style.transform='translate3d(0,0,0)';
  }
  let pdfLibrary=null,ocrLibrary=null;
  const scripts=new Map();
  function loadScript(src){
    if(!scripts.has(src))scripts.set(src,new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=src;script.onload=resolve;
      script.onerror=()=>{scripts.delete(src);script.remove();reject(new Error('A bundled sheet reader file could not be loaded. Please keep the app folder together.'));};document.head.append(script);
    }));
    return scripts.get(src);
  }
  const status=(message,error=false)=>{byId('sheet-status').textContent=message;byId('sheet-status').hidden=!message;byId('sheet-status').classList.toggle('error',error);};
  const active=s=>session===s;
  function dispose(s){
    if(!s)return;
    s.cancelPdfStart?.();
    s.render?.cancel();
    if(s.worker)void s.worker.terminate().catch(()=>{});
    // A PDFWorker provided by the caller is not owned by the loading task.
    const destroyed=s.pdfTask?s.pdfTask.destroy().catch(()=>{}):Promise.resolve();
    void destroyed.finally(()=>{s.pdfWorker?.destroy();s.pdfPort?.terminate();for(const url of s.urls)URL.revokeObjectURL(url);});
  }
  function close(){
    document.dispatchEvent(new Event('sheet-playback-stop'));
    gesture.cancel();setAuto(false);const previous=session;session=null;dispose(previous);
    pages=[];labels=[];currentLabel=null;steps=0;zoom=1;fit=true;pagesEl.replaceChildren();viewport.scrollTop=viewport.scrollLeft=0;syncScroll();
    byId('sheet-empty').hidden=false;byId('sheet-toolbar').hidden=byId('sheet-player').hidden=true;
    byId('sheet-close').disabled=true;byId('sheet-file').value='';byId('sheet-name').textContent='Sheet music';
    byId('sheet-name').removeAttribute('title');status('Load a song and play along.');updateControls();
  }
  function makePage(width,height){
    const outer=document.createElement('div'),el=document.createElement('div');
    outer.className='sheet-page-frame';el.className='sheet-page';outer.append(el);pagesEl.append(outer);
    el.style.width=width+'px';el.style.height=height+'px';outer.setAttribute('aria-label',`Page ${pages.length+1}`);
    const page={outer,el,width,height,scale:1};pages.push(page);return page;
  }
  function locationAnchor(){
    const page=pages.find(p=>p.outer.offsetTop+p.outer.offsetHeight>viewport.scrollTop)||pages.at(-1);
    return page?{page,fraction:(viewport.scrollTop-page.outer.offsetTop)/Math.max(1,page.outer.offsetHeight)}:null;
  }
  function layout(preserve=true){
    const anchor=preserve?locationAnchor():null;
    const available=Math.max(100,viewport.clientWidth-24);
    for(const page of pages){
      page.scale=fit?Math.min(2,available/page.width):zoom;
      page.outer.style.width=page.width*page.scale+'px';page.outer.style.height=page.height*page.scale+'px';
      page.el.style.transform=`scale(${page.scale})`;
    }
    if(anchor)viewport.scrollTop=anchor.page.outer.offsetTop+anchor.fraction*anchor.page.outer.offsetHeight;
    syncScroll();updateControls();
  }
  function pageIndex(){return Math.max(0,pages.findIndex(p=>p.outer.offsetTop+p.outer.offsetHeight>viewport.scrollTop+24));}
  function updateControls(){
    const current=pages[pageIndex()],scale=fit?(current?.scale||1):zoom;
    byId('sheet-zoom').textContent=Math.round(scale*100)+'%';byId('sheet-fit').setAttribute('aria-pressed',String(fit));
    byId('sheet-key-reset').textContent=steps===0?'Original':`${steps>0?'+':''}${steps} st`;
    byId('sheet-key-reset').disabled=!labels.length;
    byId('sheet-key-down').disabled=(!labels.length)||steps<=-24;byId('sheet-key-up').disabled=(!labels.length)||steps>=24;
    byId('sheet-page-number').textContent=`${pages.length?pageIndex()+1:0} / ${pages.length}`;
    const bottom=viewport.scrollHeight-viewport.clientHeight;
    byId('sheet-previous').disabled=!pages.length||viewport.scrollTop<=1;
    byId('sheet-next').disabled=!pages.length||viewport.scrollTop>=bottom-1;
    byId('sheet-zoom-out').disabled=scale<=.15;byId('sheet-zoom-in').disabled=scale>=3;
  }
  function navigate(direction){
    if(!pages.length)return;
    const index=pageIndex(),page=pages[index];
    // A long scan or PDF page can occupy several screens. Read it before moving on.
    const top=page.outer.offsetTop,bottom=top+page.outer.offsetHeight,step=Math.max(40,viewport.clientHeight*.88);
    let target=viewport.scrollTop+direction*step;
    if(direction>0&&bottom<=viewport.scrollTop+viewport.clientHeight+2&&pages[index+1])target=pages[index+1].outer.offsetTop;
    if(direction<0&&viewport.scrollTop<=top+2&&pages[index-1])target=Math.max(pages[index-1].outer.offsetTop,top-step);
    viewport.scrollTop=Math.max(0,target);syncScroll();updateControls();
  }
  function setAuto(value){
    auto=value;byId('sheet-auto').setAttribute('aria-pressed',String(auto));byId('sheet-auto').textContent=auto?'Ⅱ Pause':'▶ Auto scroll';
    startScrolling();
  }
  function startScrolling(){
    if((!auto&&!holding)||Number(byId('sheet-speed').value)===0){cancelAnimationFrame(frame);frame=0;lastTime=0;return;}
    if(!frame&&pages.length){scrollPosition=viewport.scrollTop-scrollOffset;scrollWritten=viewport.scrollTop;lastTime=0;frame=requestAnimationFrame(tick);}
  }
  function tick(now){
    frame=0;if((!auto&&!holding)||!pages.length)return;
    const dt=lastTime?Math.min(.05,(now-lastTime)/1000):0;lastTime=now;
    // Native scrolling can round to whole device pixels. Compensate that rounding
    // on the compositor so even 1 px/s moves on every frame, not once per pixel.
    // Compare with the last actual write to recognize manual scrolling exactly.
    if(Math.abs(scrollWritten-viewport.scrollTop)>.01)syncScroll();
    const bottom=Math.max(0,viewport.scrollHeight-viewport.clientHeight);
    scrollPosition=Math.min(bottom,scrollPosition+Number(byId('sheet-speed').value)*(auto&&holding?3:1)*dt);
    viewport.scrollTop=scrollPosition;
    scrollWritten=viewport.scrollTop;scrollOffset=scrollWritten-scrollPosition;
    pagesEl.style.transform=`translate3d(0,${scrollOffset}px,0)`;
    if(scrollPosition>=bottom){holding=false;setAuto(false);return;}
    frame=requestAnimationFrame(tick);
  }
  const gesture=new S.SpaceGesture({next:()=>navigate(1),previous:()=>navigate(-1),hold:value=>{holding=value;startScrolling();}});
  function spaceAllowed(event){
    return pages.length&&!document.querySelector('dialog[open]')&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.isComposing&&
      !event.target.closest('textarea,select,input:not([type="radio"]):not([type="range"]),[contenteditable="true"],[role="textbox"]');
  }
  function selectLabel(el){
    currentLabel?.classList.remove('sheet-current');
    currentLabel=el;el.classList.add('sheet-current');
  }
  function playLabel(el){
    if(!el)return;
    selectLabel(el);
    // Move only the sheet viewport, keeping the rest of the app in place.
    const rect=el.getBoundingClientRect(),view=viewport.getBoundingClientRect();
    if(rect.top<view.top||rect.bottom>view.bottom)viewport.scrollTop+=rect.top-view.top-24;
    if(rect.left<view.left||rect.right>view.right)viewport.scrollLeft+=rect.left-view.left-24;
    syncScroll();
    document.dispatchEvent(new CustomEvent('sheet-chord-select',{detail:{symbol:el.dataset.chordSymbol}}));
  }
  document.addEventListener('keydown',event=>{
    if(['Tab','Backquote','CapsLock'].includes(event.code)&&!document.querySelector('dialog[open]')){
      event.preventDefault();event.stopImmediatePropagation();
      if(event.repeat||event.ctrlKey||event.altKey||event.metaKey||event.isComposing)return;
      if(event.code==='CapsLock'){playLabel(currentLabel);return;}
      const index=labels.findIndex(label=>label.el===currentLabel);
      const candidates=event.code==='Backquote'?labels.slice(0,Math.max(0,index)).reverse():labels.slice(index+1);
      const next=candidates.find(({el})=>{
        const chord=S.wheelChord(el.dataset.chordSymbol);
        return chord&&window.Music.chords.some(c=>c.id===chord.id);
      });
      playLabel(next?.el);return;
    }
    if(event.code!=='Space'||!spaceAllowed(event))return;
    event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)gesture.press();
  },true);
  document.addEventListener('keyup',event=>{
    if(event.code!=='Space'||!gesture.down)return;
    event.preventDefault();event.stopImmediatePropagation();gesture.release();
  },true);
  const suspend=()=>{gesture.cancel();setAuto(false);};
  window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
  byId('help-button').addEventListener('click',suspend);
  function bindPlayable(el,detail){
    let gate=null;
    const start=()=>{if(gate)return;selectLabel(el);gate={released:false};document.dispatchEvent(new CustomEvent('sheet-chord-select',{detail:{...detail(),gate}}));};
    const end=event=>{if(!gate)return;gate.released=true;gate.cancelled=['pointercancel','lostpointercapture','blur'].includes(event?.type);document.dispatchEvent(new CustomEvent('sheet-chord-release',{detail:{gate}}));gate=null;};
    el.style.touchAction='none';
    el.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();el.setPointerCapture(event.pointerId);start();});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,end);
    el.addEventListener('keydown',event=>{if(['Enter','Space'].includes(event.code)){event.preventDefault();event.stopPropagation();if(!event.repeat)start();}});
    el.addEventListener('keyup',event=>{if(['Enter','Space'].includes(event.code)){event.preventDefault();event.stopPropagation();end();}});
    el.addEventListener('blur',end);
    // Assistive-technology/programmatic activation has no press/release pair.
    el.addEventListener('click',event=>{if(event.detail===0&&!gate){selectLabel(el);document.dispatchEvent(new CustomEvent('sheet-chord-select',{detail:detail()}));}});
  }
  function addLabel(el,original,width){
    labels.push({el,original,width});el.dataset.chordSymbol=original;el.classList.add('sheet-chord');el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',`Play ${original}`);el.title=`${original} · play`;
    bindPlayable(el,()=>({symbol:el.dataset.chordSymbol}));
  }
  function transpose(delta){
    if(delta!==null)steps=delta===0?0:Math.max(-24,Math.min(24,steps+delta));
    for(const {el,original,width} of labels){
      el.dataset.chordSymbol=S.transpose(original,steps);
      el.textContent=el.dataset.chordSymbol;
      el.setAttribute('aria-label',`Play ${el.dataset.chordSymbol}`);el.title=`${el.dataset.chordSymbol} · play`;
      if(el.classList.contains('sheet-chord-overlay')){
        el.style.transform='';el.style.width='auto';el.style.minWidth='0';
        const measured=el.offsetWidth;el.style.transform=`scaleX(${Math.min(1,width/Math.max(1,measured))})`;
        el.style.minWidth=(width/Math.min(1,width/Math.max(1,measured)))+'px';
      }
    }
    updateControls();
  }
  function textPages(text){
    const lines=text.replace(/\r\n?/g,'\n').split('\n');
    const chunks=[];let chunk=[];
    for(const line of lines){
      for(const [i,part] of line.split('\f').entries()){
        if(i&&chunk.length){chunks.push(chunk);chunk=[];}
        if(chunk.length>=38&&!S.chordRanges(chunk.at(-1)).length){chunks.push(chunk);chunk=[];}
        chunk.push(part);
      }
    }
    if(chunk.length)chunks.push(chunk);
    const measure=document.createElement('canvas').getContext('2d');measure.font="20px Consolas, 'Microsoft JhengHei', monospace";
    for(const rows of chunks){
      const width=Math.max(620,...rows.map(line=>measure.measureText(line.replace(/\t/g,'    ')).width+88));
      const page=makePage(width,rows.length*37+80),pre=document.createElement('pre');pre.className='sheet-text';
      for(const line of rows){
        let start=0;
        for(const chord of S.chordRanges(line)){
          pre.append(document.createTextNode(line.slice(start,chord.start)));
          const el=document.createElement('span');el.textContent=chord.value;
          el.style.width=measure.measureText(chord.value).width+'px';addLabel(el,chord.value);pre.append(el);start=chord.end;
        }
        pre.append(document.createTextNode(line.slice(start)+'\n'));
      }
      page.el.append(pre);
    }
  }
  function backgroundColor(canvas,x,y,w,h){
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),colors=[];
    // A single sample can land on a bar line or neighboring glyph. Use the
    // brightest perimeter samples so dark printed ink does not become a box.
    for(let i=0;i<8;i++)for(const dy of [-2,h+2]){
      const px=Math.max(0,Math.min(canvas.width-1,Math.round(x+w*i/7))),py=Math.max(0,Math.min(canvas.height-1,Math.round(y+dy)));
      colors.push(ctx.getImageData(px,py,1,1).data);
    }
    colors.sort((a,b)=>(b[0]+b[1]+b[2])-(a[0]+a[1]+a[2]));
    const c=colors[3];return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  function overlay(page,canvas,value,x,y,width,height,font='sans-serif'){
    if(width<=0||height<=0)return;
    const el=document.createElement('span');el.className='sheet-chord-overlay';el.textContent=value;
    Object.assign(el.style,{left:x+'px',top:y+'px',fontFamily:font,fontSize:height+'px',height:height+'px',background:backgroundColor(canvas,x,y,width,height)});
    addLabel(el,value,width);page.el.append(el);
  }
  async function pdfText(page,pdfPage,lib,canvas,view,s){
    const content=await pdfPage.getTextContent();if(!active(s))return false;
    if(!content.items.some(item=>item.str?.trim()))return false;
    // Legacy music fonts encode notes as punctuation. Their oversized ascent can
    // put their text boxes on the chord row even though the ink is on the staff.
    // Exclude only those symbol fonts from this temporary recognition layer.
    const musicFonts=new Set(Object.entries(content.styles).filter(([name,style])=>{
      const text=content.items.filter(i=>i.fontName===name).map(i=>i.str||'').join('').replace(/\s/g,'');
      return style.ascent>1.2&&style.descent<-.4&&text.length>12&&(text.match(/[\p{L}\p{N}]/gu)||[]).length<text.length*.3;
    }).map(([name])=>name));
    content.items=content.items.filter(item=>!musicFonts.has(item.fontName));
    const layer=document.createElement('div');layer.className='sheet-text-layer';layer.style.setProperty('--total-scale-factor',view.scale);
    page.el.append(layer);
    const textLayer=new lib.TextLayer({textContentSource:content,container:layer,viewport:view});await textLayer.render();
    if(!active(s))return true;
    // Read actual browser glyph geometry, including embedded PDF fonts and spacing.
    const origin=page.el.getBoundingClientRect(),scale=page.scale;
    const spans=[...layer.querySelectorAll('span')].filter(el=>el.firstChild?.nodeType===3).map(el=>({el,rect:el.getBoundingClientRect()})).sort((a,b)=>a.rect.top-b.rect.top||a.rect.left-b.rect.left);
    const rows=[];
    for(const span of spans){let row=rows.find(r=>Math.abs(r.y-span.rect.top)<Math.max(2,span.rect.height*.35));if(!row){row={y:span.rect.top,spans:[]};rows.push(row);}row.spans.push(span);}
    for(const row of rows){
      row.spans.sort((a,b)=>a.rect.left-b.rect.left);let line='',last=null;const parts=[];
      for(const span of row.spans){
        if(last&&span.rect.left-last.right>span.rect.height*.12)line+=' ';
        parts.push({...span,start:line.length});line+=span.el.textContent;last=span.rect;
      }
      for(const chord of S.chordRanges(line)){
        const first=parts.find(p=>p.start+p.el.textContent.length>chord.start),lastPart=[...parts].reverse().find(p=>p.start<chord.end);
        if(!first||!lastPart)continue;
        const range=document.createRange();range.setStart(first.el.firstChild,chord.start-first.start);range.setEnd(lastPart.el.firstChild,chord.end-lastPart.start);
        const rect=range.getBoundingClientRect(),style=getComputedStyle(first.el);
        overlay(page,canvas,chord.value,(rect.left-origin.left)/scale,(rect.top-origin.top)/scale,rect.width/scale,rect.height/scale,style.fontFamily);
      }
    }
    layer.remove();return true;
  }
  async function getPdf(){
    if(location.protocol==='file:'){
      await Promise.all([loadScript('app/vendor/pdf/pdf.classic.js'),loadScript('app/vendor/pdf/pdf.file-assets.js')]);
      return globalThis.pdfjsLib;
    }
    if(!pdfLibrary)pdfLibrary=import('./vendor/pdf/pdf.min.mjs').catch(error=>{pdfLibrary=null;throw error;});
    const lib=await pdfLibrary;lib.GlobalWorkerOptions.workerSrc=new URL('vendor/pdf/pdf.worker.min.mjs',document.currentScript?.src||new URL('app/sheet.js',document.baseURI)).href;return lib;
  }
  async function getOcr(s){
    if(!ocrLibrary)ocrLibrary=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='app/vendor/ocr/tesseract.min.js';script.onload=resolve;script.onerror=()=>{ocrLibrary=null;script.remove();reject(new Error('Local OCR files could not be loaded.'));};document.head.append(script);});
    await ocrLibrary;if(!active(s))return null;
    const base=new URL('app/vendor/ocr/',document.baseURI).href;
    let workerPath=base+'worker.min.js';
    if(location.protocol==='file:'){
      await loadScript('app/vendor/ocr/ocr.file-assets.js');if(!active(s))return null;
      const bundle=globalThis.OKeysFileOCR;
      const simd=WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,9,1,7,0,65,0,253,15,26,11]));
      workerPath=URL.createObjectURL(new Blob([simd?bundle.simdCore:bundle.core,'\n;\n',bundle.worker],{type:'text/javascript'}));s.urls.push(workerPath);
    }
    const worker=await Tesseract.createWorker('eng',1,{workerPath,corePath:base,langPath:base,workerBlobURL:false,cacheMethod:location.protocol==='file:'?'none':'write',logger:m=>{
      if(active(s))status(m.status==='recognizing text'?`Detecting chords · ${Math.round(m.progress*100)}%`:'Preparing local chord recognition…');
    }});
    if(!active(s)){await worker.terminate();return null;}
    s.worker=worker;await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'});return worker;
  }
  async function recognize(page,canvas,s){
    const worker=s.worker||await getOcr(s);if(!worker||!active(s))return;
    const result=await worker.recognize(canvas,{}, {blocks:true,text:true});if(!active(s))return;
    for(const block of result.data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
      const words=line.words||[];let text='';const offsets=[];
      for(const word of words){offsets.push({start:text.length,word});text+=word.text+' ';}
      for(const chord of S.chordRanges(text)){
        const item=offsets.find(o=>o.start<=chord.start&&o.start+o.word.text.length>=chord.end);
        if(!item||item.word.confidence<65)continue;
        const word=item.word,box=word.bbox;
        const first=word.symbols?.[chord.start-item.start]?.bbox,last=word.symbols?.[chord.end-item.start-1]?.bbox;
        const x=first?.x0??box.x0,right=last?.x1??box.x1;
        overlay(page,canvas,chord.value,x,box.y0,right-x,box.y1-box.y0,'sans-serif');
      }
    }
  }
  function reveal(){byId('sheet-empty').hidden=true;byId('sheet-toolbar').hidden=byId('sheet-player').hidden=false;layout(false);}
  async function readPdf(file,s){
    const lib=await getPdf();if(!active(s))return;
    const bytes=await file.arrayBuffer();if(!active(s))return;
    const base=new URL('app/vendor/pdf/',document.baseURI).href;
    const standalone={};
    if(location.protocol==='file:'){
      const source=URL.createObjectURL(new Blob([globalThis.OKeysFilePDF.worker],{type:'text/javascript'}));s.urls.push(source);
      s.pdfPort=new Worker(source);
      // PDFWorker({port}) expects an initialized port. Wait for PDF.js's ready
      // handshake before configuring it; cancel startup when the file is closed.
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>finish(new Error('The PDF reader could not start. Please reload OKeys.')),15000);
        const ready=event=>{if(event.data?.action==='ready')finish();};
        const failed=event=>finish(new Error(event.message||'The PDF worker could not load.'));
        const finish=error=>{clearTimeout(timer);s.cancelPdfStart=null;s.pdfPort.removeEventListener('message',ready);s.pdfPort.removeEventListener('error',failed);error?reject(error):resolve();};
        s.cancelPdfStart=()=>finish(new Error('Sheet closed.'));
        s.pdfPort.addEventListener('message',ready);s.pdfPort.addEventListener('error',failed);
      });
      if(!active(s))return;
      s.pdfWorker=new lib.PDFWorker({port:s.pdfPort});standalone.worker=s.pdfWorker;
      standalone.useWorkerFetch=false;
      standalone.BinaryDataFactory=class{
        async fetch({kind,filename}){
          const encoded=globalThis.OKeysFilePDF.assets[kind+'/'+filename];
          if(!encoded)throw new Error('Missing bundled PDF resource: '+filename);
          return Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
        }
      };
    }
    s.pdfTask=lib.getDocument({data:bytes,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',isEvalSupported:false,enableXfa:false,...standalone});
    const pdf=await s.pdfTask.promise;if(!active(s))return;
    for(let index=1;index<=pdf.numPages;index++){
      status(`Opening PDF · page ${index} of ${pdf.numPages}`);
      const source=await pdf.getPage(index);if(!active(s))return;
      const native=source.getViewport({scale:1});
      const scale=Math.min(2,Math.sqrt(48000000/(pdf.numPages*native.width*native.height)),8192/native.width,16384/native.height);
      const view=source.getViewport({scale}),page=makePage(view.width,view.height),canvas=document.createElement('canvas');
      canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);page.el.append(canvas);
      s.render=source.render({canvasContext:canvas.getContext('2d'),viewport:view});await s.render.promise;s.render=null;
      if(!active(s))return;reveal();
      const hasText=await pdfText(page,source,lib,canvas,view,s);if(!active(s))return;
      if(!hasText){s.usedOcr=true;try{await recognize(page,canvas,s);}catch(error){if(active(s))s.ocrError=error.message;}}
      if(!active(s))return;transpose(null);source.cleanup();
    }
  }
  async function readImage(file,s){
    const url=URL.createObjectURL(file);s.urls.push(url);const image=new Image();image.src=url;await image.decode();if(!active(s))return;
    const scale=Math.min(1,Math.sqrt(12000000/(image.naturalWidth*image.naturalHeight)),8192/image.naturalWidth,16384/image.naturalHeight);
    const page=makePage(Math.round(image.naturalWidth*scale),Math.round(image.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=page.width;canvas.height=page.height;canvas.getContext('2d').fillStyle='#fff';canvas.getContext('2d').fillRect(0,0,canvas.width,canvas.height);canvas.getContext('2d').drawImage(image,0,0,page.width,page.height);page.el.append(canvas);reveal();
    s.usedOcr=true;try{await recognize(page,canvas,s);}catch(error){if(active(s))s.ocrError=error.message;}
  }
  async function load(file){
    if(!file)return;
    const ext=file.name.split('.').pop().toLowerCase(),kind=ext==='pdf'?'pdf':ext==='txt'?'txt':/^(png|jpe?g|webp|gif|bmp|avif)$/.test(ext)?'image':null;
    if(!kind){status('Choose a PDF, TXT, PNG, JPG, WebP, GIF, BMP or AVIF file.',true);return;}
    if(file.size>100*1024*1024){status('This file is too large. Please use a file under 100 MB.',true);return;}
    close();const s={urls:[],worker:null,pdfTask:null,render:null};session=s;
    byId('sheet-name').textContent=file.name;byId('sheet-name').title=file.name;byId('sheet-close').disabled=false;status('Opening your music…');
    panel.setAttribute('aria-busy','true');
    try{
      if(kind==='txt'){const data=await file.arrayBuffer();if(!active(s))return;textPages(S.decodeText(data));reveal();}
      else if(kind==='pdf')await readPdf(file,s);else await readImage(file,s);
      if(!active(s))return;
      transpose(null);layout(false);
      status(s.ocrError?`Sheet ready · OCR unavailable: ${s.ocrError}`:labels.length?'':'Sheet ready · no chord labels detected.');
    }catch(error){
      if(active(s))status(error.name==='PasswordException'?'This PDF is password protected. Open an unlocked copy.':`Could not open this sheet. ${error.message||'Try another file.'}`,true);
    }finally{
      if(active(s)){panel.removeAttribute('aria-busy');if(s.worker){void s.worker.terminate().catch(()=>{});s.worker=null;}updateControls();}
    }
  }
  byId('sheet-open').onclick=byId('sheet-browse').onclick=()=>byId('sheet-file').click();
  byId('sheet-file').onchange=event=>void load(event.target.files[0]);byId('sheet-close').onclick=()=>{close();panel.removeAttribute('aria-busy');};
  byId('sheet-previous').onclick=()=>navigate(-1);byId('sheet-next').onclick=()=>navigate(1);
  byId('sheet-key-down').onclick=()=>transpose(-1);byId('sheet-key-up').onclick=()=>transpose(1);byId('sheet-key-reset').onclick=()=>transpose(0);
  for(const [id,factor] of [['sheet-zoom-in',1.2],['sheet-zoom-out',1/1.2]])byId(id).onclick=()=>{zoom=Math.max(.15,Math.min(3,(fit?(pages[pageIndex()]?.scale||1):zoom)*factor));fit=false;layout();};
  byId('sheet-fit').onclick=()=>{fit=true;layout();};byId('sheet-auto').onclick=()=>{if(!auto&&viewport.scrollTop>=viewport.scrollHeight-viewport.clientHeight-1)viewport.scrollTop=0;setAuto(!auto);};
  byId('sheet-speed').oninput=event=>{byId('sheet-speed-value').textContent=event.target.value+' px/s';startScrolling();};
  viewport.addEventListener('scroll',()=>{if(Math.abs(scrollWritten-viewport.scrollTop)>.01)syncScroll();updateControls();},{passive:true});new ResizeObserver(()=>layout()).observe(viewport);
  let dragDepth=0;
  document.addEventListener('dragenter',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();dragDepth++;panel.querySelector('.sheet-drop-hint').hidden=false;}});
  document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
  document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;panel.querySelector('.sheet-drop-hint').hidden=true;}});
  document.addEventListener('drop',event=>{if(!event.dataTransfer?.files.length)return;event.preventDefault();dragDepth=0;panel.querySelector('.sheet-drop-hint').hidden=true;void load(event.dataTransfer.files[0]);});
  window.addEventListener('pagehide',()=>{suspend();dispose(session);});
  updateControls();
})();
