import { useEffect, useRef, useId, type ReactNode } from "react";
import { useI18n } from "../lib/i18n";

export function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
  const ref=useRef<HTMLDivElement>(null),titleId=useId(),{t}=useI18n();
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,el=ref.current;
    const controls=()=>Array.from(el?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')??[]);
    (el?.querySelector<HTMLElement>('[data-autofocus]')??controls()[0])?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close.current();}
      if(e.key==="Tab"){
        const list=controls(),first=list[0],last=list.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    el?.addEventListener("keydown",key);
    return()=>{el?.removeEventListener("keydown",key);if(previous?.isConnected)previous.focus();};
  },[]);
  return <div className="workspace-modal-backdrop"><div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`workspace-modal${wide?" workspace-modal-wide":""}`}>
    <header><h2 id={titleId}>{title}</h2><button type="button" aria-label={t("Закрыть","Close")} onClick={onClose}>×</button></header>
    {children}
  </div></div>;
}
