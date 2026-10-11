'use strict';
// Small glass listbox shared by sound selection and MIDI device selection.
class GlassSelect {
  constructor(host,label,onChange){
    this.host=host;this.onChange=onChange;this.options=[];
    this.button=document.createElement('button');this.button.className='select-trigger';this.button.setAttribute('aria-label',label);this.button.setAttribute('aria-haspopup','listbox');this.button.setAttribute('aria-expanded','false');
    this.list=document.createElement('div');this.list.className='select-menu glass';this.list.id=host.id+'-options';this.list.setAttribute('role','listbox');this.list.setAttribute('aria-label',label);this.list.hidden=true;this.button.setAttribute('aria-controls',this.list.id);host.append(this.button,this.list);
    this.button.onclick=()=>this.list.hidden?this.open():this.close();
    host.addEventListener('keydown',event=>{
      if(this.list.hidden&&!['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key))return;
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();this.close();this.button.focus();}
      else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();if(this.list.hidden)this.open();
        const buttons=[...this.list.children],at=buttons.indexOf(document.activeElement);
        const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
        buttons[index]?.focus();
      }else if(event.key==='Tab')this.close();
    });
    document.addEventListener('pointerdown',e=>{if(!host.contains(e.target))this.close();});
    host.addEventListener('focusout',e=>{if(!host.contains(e.relatedTarget))this.close();});
  }
  setOptions(options,value){this.options=options;this.value=value;this.button.textContent=(options.find(o=>o.value===value)?.label||'No device')+' ⌄';this.list.replaceChildren(...options.map(option=>{const b=document.createElement('button');b.type='button';b.textContent=option.label;b.setAttribute('role','option');b.setAttribute('aria-selected',String(option.value===value));b.onclick=()=>{this.setOptions(this.options,option.value);this.close();this.button.focus();this.onChange(option.value);};return b;}));}
  open(){if(!this.options.length)return;this.list.hidden=false;this.button.setAttribute('aria-expanded','true');this.list.querySelector('[aria-selected=true]')?.focus();}
  close(){this.list.hidden=true;this.button.setAttribute('aria-expanded','false');}
}
