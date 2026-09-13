import type { NodeAppearance } from "../model/types";
export function NotationShape({appearance:a,embedded=false}:{appearance:NodeAppearance;embedded?:boolean}){
 const w=a.width,h=a.height,inset=Math.max(1,(a.strokeWidth??1.3)/2),sw=a.marker==="end"?3:a.strokeWidth??1.3;
 let shape:React.ReactNode;
 switch(a.shape){
  case "ellipse":shape=<ellipse cx={w/2} cy={h/2} rx={w/2-inset} ry={h/2-inset}/>;break;
  case "diamond":shape=<path d={`M${w/2} ${inset}L${w-inset} ${h/2}L${w/2} ${h-inset}L${inset} ${h/2}Z`}/>;break;
  case "parallelogram":shape=<path d={`M${w*.18} ${inset}H${w-inset}L${w*.82} ${h-inset}H${inset}Z`}/>;break;
  case "cylinder":{const r=Math.min(18,h*.16);shape=<><path d={`M${inset} ${r}C${inset} ${-r/3} ${w-inset} ${-r/3} ${w-inset} ${r}V${h-r}C${w-inset} ${h+r/3} ${inset} ${h+r/3} ${inset} ${h-r}Z`}/><path fill="none" d={`M${inset} ${r}C${inset} ${r*2.2} ${w-inset} ${r*2.2} ${w-inset} ${r}`}/></>;break;}
  case "document":shape=<path d={`M${inset} ${inset}H${w-inset}V${h*.82}C${w*.64} ${h*.62} ${w*.4} ${h*1.12} ${inset} ${h*.88}Z`}/>;break;
  case "text":shape=null;break;
  default:shape=<rect x={inset} y={inset} width={Math.max(1,w-inset*2)} height={Math.max(1,h-inset*2)} rx={a.shape==="rounded"?Math.min(h/5,18):a.shape==="group"?4:0}/>;
 }
 return <svg className={embedded?"notation-shape-embedded":"notation-shape"} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><g fill={a.fill} stroke={a.stroke} strokeWidth={sw}>{shape}{a.marker==="intermediate"&&<ellipse cx={w/2} cy={h/2} rx={Math.max(1,w/2-5)} ry={Math.max(1,h/2-5)} fill="none" strokeWidth={1}/>}</g>{a.marker&&["exclusive","parallel","inclusive"].includes(a.marker)&&<g stroke={a.stroke} strokeWidth={2.6} fill="none">{a.marker==="inclusive"?<circle cx={w/2} cy={h/2} r={Math.min(w,h)*.17}/>:a.marker==="exclusive"?<path d={`M${w*.39} ${h*.39}L${w*.61} ${h*.61}M${w*.61} ${h*.39}L${w*.39} ${h*.61}`}/>:<path d={`M${w/2} ${h*.34}V${h*.66}M${w*.34} ${h/2}H${w*.66}`}/>}</g>}</svg>;
}
