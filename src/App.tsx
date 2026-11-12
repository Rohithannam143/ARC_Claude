import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { createWorker } from "tesseract.js";
import {
  Activity, AlignCenter, AlignLeft, AlignRight, ArrowLeft, ArrowRight, Bold, Bell, BookOpen, BrainCircuit, Check, CheckSquare, ClipboardList, ExternalLink, Moon, Sun, Send,
  ChevronDown, Download, FilePlus2, FileText, FolderOpen, GraduationCap,
  Highlighter, Italic, LayoutDashboard, Lightbulb, List, ListOrdered, Menu, MessageSquareText, MoreHorizontal,
  Plus, Search, Settings2, Sparkles, Star, Strikethrough, Trash2, Underline, UploadCloud, X, Pencil, Workflow, Eye, RefreshCw
} from "lucide-react";

import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import mermaid from "mermaid";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import * as mammoth from "mammoth";
import * as XLSX from "xlsx";
import { cloudRequest, uploadUserFile } from "./cloud";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ArchiveEntry = { path:string; size:number; kind:string; text:string; supported:boolean };
type Note = { id:number; title:string; subject:string; updated:string; color:string; excerpt:string; body:string; filePath?:string };
const starterNotes:Note[]=[
 {id:1,title:"Introduction to Artificial Intelligence",subject:"Artificial Intelligence",updated:"Today",color:"violet",excerpt:"Core concepts, intelligent agents, problem-solving and search strategies.",body:"# Introduction to Artificial Intelligence\n\nArtificial Intelligence (AI) is the field of building systems that can perform tasks that normally require human intelligence.\n\n## Key topics\n- Intelligent agents\n- Problem-solving agents\n- Search strategies\n- Heuristic functions\n\nAdd your own class notes here."},
 {id:2,title:"Compiler Design — Lexical Analysis",subject:"Compiler Design",updated:"Yesterday",color:"blue",excerpt:"Tokens, patterns, lexemes and the role of a lexical analyser.",body:"# Lexical Analysis\n\nA lexical analyser is the first phase of a compiler. It reads source code and groups characters into tokens.\n\n## Important terms\n- Token: a category such as identifier or keyword\n- Lexeme: the actual character sequence\n- Pattern: the rule describing a token"},
 {id:3,title:"Cloud Computing Fundamentals",subject:"Cloud Computing",updated:"Nov 10",color:"orange",excerpt:"Service models, deployment models, virtualization and cloud architecture.",body:"# Cloud Computing Fundamentals\n\nCloud computing provides on-demand access to computing resources over a network.\n\n## Service models\n- IaaS\n- PaaS\n- SaaS"}
];
const navItems=[{label:"Overview",icon:LayoutDashboard},{label:"My Notes",icon:FileText},{label:"Library",icon:FolderOpen},{label:"Letter Templates",icon:ClipboardList},{label:"AI Study Room",icon:BrainCircuit},{label:"Flashcards",icon:GraduationCap},{label:"Settings",icon:Settings2}];

function cleanEditorHTML(input:string){
 const doc=new DOMParser().parseFromString(input,"text/html");
 const allowed=new Set(["P","DIV","BR","STRONG","B","EM","I","U","S","STRIKE","H1","H2","H3","H4","UL","OL","LI","BLOCKQUOTE","SPAN","FONT","IMG","HR","INPUT"]);
 const walk=(node:Element)=>{
  Array.from(node.children).forEach(child=>{
   walk(child);
   if(!allowed.has(child.tagName)){child.replaceWith(...Array.from(child.childNodes));return;}
   Array.from(child.attributes).forEach(attr=>{
    if(child.tagName==="IMG"&&attr.name==="src"&&attr.value.startsWith("data:image/png;base64,"))return;
    if(child.tagName==="INPUT"&&((attr.name==="type"&&attr.value==="checkbox")||attr.name==="checked"))return;
    if(child.tagName==="UL"&&attr.name==="class"&&attr.value==="task-list")return;
    if(attr.name==="face"||attr.name==="color"||attr.name==="size"){if(child.tagName==="FONT"&&/^(face|color|size)$/.test(attr.name))return;child.removeAttribute(attr.name);return;}
    if(attr.name!=="style"){child.removeAttribute(attr.name);return;}
    const safe=attr.value.split(";").map(rule=>rule.trim()).filter(rule=>/^(color|background-color|font-family|font-size|font-weight|font-style|text-align|text-decoration|border|border-radius|padding|margin|display|width|height)\s*:/i.test(rule)&&!/(url\(|expression|javascript:)/i.test(rule));
    if(safe.length)child.setAttribute("style",safe.join(";"));else child.removeAttribute("style");
   });
  });
 };
 walk(doc.body);
 return doc.body.innerHTML;
}
function initialEditorHTML(value:string){
 if(/<(p|div|br|strong|b|em|i|u|h[1-6]|ul|ol|li|blockquote|span|font)\b/i.test(value))return cleanEditorHTML(value);
 return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");
}

function App(){
 const drawCanvasRef=useRef<HTMLCanvasElement>(null);
 const drawPointsRef=useRef<{x:number;y:number}[]>([]);
 const drawingRef=useRef(false);
 const [showRuler,setShowRuler]=useState(true);
 const [isDoodleMode,setIsDoodleMode]=useState(false);
 const completedStrokesRef=useRef<{points:{x:number;y:number}[];mode:string;color:string;width:number}[]>([]);
 const [rulerIndent,setRulerIndent]=useState(12);
 const [rightIndent,setRightIndent]=useState(8);
 const drawMode="pen";
 const [drawColor,setDrawColor]=useState("#d5d7e0");
 const drawWidth=3;
 const [theme,setTheme]=useState<"dark"|"light">(()=>localStorage.getItem("arc-theme")==="light"?"light":"dark");
 const [firebaseKey,setFirebaseKey]=useState(()=>localStorage.getItem("arc-firebase-api-key")||"AIzaSyDdIapYAZlLhJFL6OZ7ixw6pIuRFq4pdxs");
 const [aiMessages,setAiMessages]=useState<{role:"user"|"assistant";content:string}[]>([]);
 const [aiInput,setAiInput]=useState("");
 const [aiBusy,setAiBusy]=useState(false);
 const [aiError,setAiError]=useState("");
 const [aiResult,setAiResult]=useState("");
 const [noteCopilotInput,setNoteCopilotInput]=useState("");
 const [noteCopilotMessages,setNoteCopilotMessages]=useState<{role:"user"|"assistant";content:string}[]>([]);
 const [noteCopilotBusy,setNoteCopilotBusy]=useState(false);
 const [flashcardDecks,setFlashcardDecks]=useState<{noteTitle:string;cards:{front:string;back:string}[];createdAt:string}[]>(()=>{try{return JSON.parse(localStorage.getItem("arc-flashcard-decks")||"[]")}catch{return[]}});
 const [activeDeck,setActiveDeck]=useState<number|null>(null);
 const [flippedCards,setFlippedCards]=useState<Record<number,boolean>>({});
 const [studyIndex,setStudyIndex]=useState(0);
 const [studyMode,setStudyMode]=useState<"browse"|"quiz">("browse");
 const [knownCards,setKnownCards]=useState<Record<string,boolean>>({});
 const [selectedSummary,setSelectedSummary]=useState("");
 const [noteKnowledge,setNoteKnowledge]=useState<{id:number;title:string;subject:string;content:string}[]>([]);
 const [knowledgeUpdated,setKnowledgeUpdated]=useState(0);
 const [visualization,setVisualization]=useState("");
 const [visualBusy,setVisualBusy]=useState(false);
 const [visualError,setVisualError]=useState("");
 const visualDiagramRef=useRef<HTMLDivElement>(null);

 const [templateUrl,setTemplateUrl]=useState("");
 const [templateBusy,setTemplateBusy]=useState(false);
 const [active,setActive]=useState("Overview");
 const [query,setQuery]=useState("");
 const [notes,setNotes]=useState<Note[]>(()=>{try{return JSON.parse(localStorage.getItem("arc-notes")||"null")||starterNotes}catch{return starterNotes}});
 const [mobileNav,setMobileNav]=useState(false);
 const [selected,setSelected]=useState<number|null>(null);
 const [draft,setDraft]=useState("");
 const [titleDraft,setTitleDraft]=useState("");
 const [toast,setToast]=useState("");
 const [archive,setArchive]=useState<ArchiveEntry[]>([]);
 const [archiveName,setArchiveName]=useState("");
 const [archiveBusy,setArchiveBusy]=useState(false);
 const [archiveError,setArchiveError]=useState("");
 const [archiveSelected,setArchiveSelected]=useState<string>("");
 const [archiveFilter,setArchiveFilter]=useState("");
 const fileRef=useRef<HTMLInputElement>(null);
 const editorRef=useRef<HTMLDivElement>(null);
 const current=notes.find(n=>n.id===selected)||null;
 useEffect(()=>{localStorage.setItem("arc-notes",JSON.stringify(notes))},[notes]);
 useEffect(()=>{localStorage.setItem("arc-flashcard-decks",JSON.stringify(flashcardDecks))},[flashcardDecks]);
 useEffect(()=>{const refresh=()=>{setNoteKnowledge(notes.map(n=>({id:n.id,title:n.title,subject:n.subject,content:(n.body||"").replace(/<[^>]*>/g," ").replace(/\\s+/g," ").trim()})));setKnowledgeUpdated(Date.now())};refresh();const timer=window.setInterval(refresh,2500);return()=>window.clearInterval(timer)},[notes]);
 useEffect(()=>{if(!visualization||!visualDiagramRef.current)return;let cancelled=false;const source=visualization.match(/```(?:mermaid)?\\s*([\\s\\S]*?)```/i)?.[1]||visualization;const code=source.trim();if(!/^(flowchart|graph|mindmap|sequenceDiagram|stateDiagram)/m.test(code))return;const node=visualDiagramRef.current;node.innerHTML="";void(async()=>{try{mermaid.initialize({startOnLoad:false,securityLevel:"strict",theme:theme==="light"?"default":"dark",flowchart:{curve:"basis",htmlLabels:false}});const id="arc-diagram-"+Date.now();const rendered=await mermaid.render(id,code);if(!cancelled)node.innerHTML=rendered.svg}catch(error){if(!cancelled)setVisualError("The AI response could not be rendered as a diagram. Try generating it again.")}})();return()=>{cancelled=true}},[visualization,theme]);
 useEffect(()=>{setNoteCopilotMessages([]);setNoteCopilotInput("");setSelectedSummary("")},[selected]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem("arc-theme",theme)},[theme]);
 useEffect(()=>{if(current){setDraft(current.body);setTitleDraft(current.title);if(editorRef.current)editorRef.current.innerHTML=initialEditorHTML(current.body)}},[selected]);
 const filtered=useMemo(()=>notes.filter(n=>(n.title+n.subject+n.excerpt+n.body).toLowerCase().includes(query.toLowerCase())),[notes,query]);
 function notify(s:string){setToast(s);window.setTimeout(()=>setToast(""),2600)}
 function openNote(n:Note){setSelected(n.id);setActive("Editor")}


 function drawCanvasStroke(points:{x:number;y:number}[],mode:string,color:string,width:number){
  const canvas=drawCanvasRef.current;if(!canvas||points.length<1)return;const ctx=canvas.getContext("2d");if(!ctx)return;
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();const first=points[0];ctx.moveTo(first.x,first.y);
  if(mode==="line"&&points.length>1){ctx.lineTo(points[points.length-1].x,points[points.length-1].y);}
  else if(mode==="rectangle"&&points.length>1){const last=points[points.length-1];ctx.rect(first.x,first.y,last.x-first.x,last.y-first.y);}
  else if(mode==="circle"&&points.length>1){const last=points[points.length-1];ctx.ellipse((first.x+last.x)/2,(first.y+last.y)/2,Math.max(Math.abs(last.x-first.x)/2,2),Math.max(Math.abs(last.y-first.y)/2,2),0,0,Math.PI*2);}
  else if(points.length===2){ctx.lineTo(points[1].x,points[1].y);}else{for(let i=1;i<points.length-1;i++){const mx=(points[i].x+points[i+1].x)/2,my=(points[i].y+points[i+1].y)/2;ctx.quadraticCurveTo(points[i].x,points[i].y,mx,my);}const last=points[points.length-1];ctx.lineTo(last.x,last.y);}ctx.stroke();
 }
 function pointerPoint(e:React.PointerEvent<HTMLCanvasElement>){const r=e.currentTarget.getBoundingClientRect();return{x:(e.clientX-r.left)*e.currentTarget.width/r.width,y:(e.clientY-r.top)*e.currentTarget.height/r.height};}
 function redrawDoodleCanvas(currentPoints?:{x:number;y:number}[]){const canvas=drawCanvasRef.current;if(!canvas)return;const ctx=canvas.getContext("2d");if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);completedStrokesRef.current.forEach(stroke=>drawCanvasStroke(stroke.points,stroke.mode,stroke.color,stroke.width));if(currentPoints?.length)drawCanvasStroke(currentPoints,drawMode,drawColor,drawWidth);}
 function startDrawing(e:React.PointerEvent<HTMLCanvasElement>){
  if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
  const p=pointerPoint(e);drawPointsRef.current=[p];drawingRef.current=true;redrawDoodleCanvas([p]);
 }
 function moveDrawing(e:React.PointerEvent<HTMLCanvasElement>){
  if(!drawingRef.current)return;e.preventDefault();drawPointsRef.current.push(pointerPoint(e));redrawDoodleCanvas(drawPointsRef.current);
 }
 function finishDrawing(e?:React.PointerEvent<HTMLCanvasElement>){
  if(!drawingRef.current)return;drawingRef.current=false;
  if(e&&e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  const pts=drawPointsRef.current;if(!pts.length)return;
  const first=pts[0],last=pts[pts.length-1],distance=Math.hypot(last.x-first.x,last.y-first.y);
  const path=pts.reduce((sum,p,i)=>i?sum+Math.hypot(p.x-pts[i-1].x,p.y-pts[i-1].y):0,0);
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const w=maxX-minX,h=maxY-minY,closed=distance<Math.max(w,h)*.28&&path>35;
  let mode=drawMode,corrected=pts;
  if(drawMode==="pen"){
   if(distance/Math.max(path,1)>.9&&distance>28){mode="line";corrected=[first,last];}
   else if(closed&&w>22&&h>22){
    const aspect=Math.min(w,h)/Math.max(w,h),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
    const radii=pts.map(p=>Math.hypot(p.x-cx,p.y-cy)),mean=radii.reduce((a,b)=>a+b,0)/radii.length;
    const variation=Math.sqrt(radii.reduce((a,b)=>a+(b-mean)**2,0)/radii.length)/(mean||1);
    if(aspect>.72&&variation<.24){mode="circle";corrected=[{x:minX,y:minY},{x:maxX,y:maxY}];}
    else if(aspect>.35){mode="rectangle";corrected=[{x:minX,y:minY},{x:maxX,y:maxY}];}
   }
  }
  completedStrokesRef.current.push({points:corrected,mode,color:drawColor,width:drawWidth});drawPointsRef.current=[];redrawDoodleCanvas();notify(mode==="pen"?"Stroke added":"Auto-corrected "+mode);
 }
 function completeDoodle(){if(drawingRef.current)finishDrawing();insertDrawingIntoNote();clearDrawing();setIsDoodleMode(false);}
 function cancelDoodle(){clearDrawing();setIsDoodleMode(false);}
 function insertDrawingIntoNote(){
  const canvas=drawCanvasRef.current;if(!canvas||!editorRef.current)return;
  const ctx=canvas.getContext("2d");if(!ctx)return;
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
  let minX=canvas.width,minY=canvas.height,maxX=0,maxY=0,found=false;
  for(let y=0;y<canvas.height;y++){for(let x=0;x<canvas.width;x++){if(data[(y*canvas.width+x)*4+3]>8){found=true;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}}
  if(!found){notify("Draw something on the note before pressing Done");return;}
  const pad=18,left=Math.max(0,minX-pad),top=Math.max(0,minY-pad),right=Math.min(canvas.width,maxX+pad),bottom=Math.min(canvas.height,maxY+pad);
  const cropped=document.createElement("canvas");cropped.width=right-left;cropped.height=bottom-top;
  const cropCtx=cropped.getContext("2d");if(!cropCtx)return;
  cropCtx.drawImage(canvas,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);
  const image=cropped.toDataURL("image/png");editorRef.current.focus();
  document.execCommand("insertHTML",false,'<img src="'+image+'" alt="Hand-drawn diagram" style="max-width:100%;height:auto;vertical-align:middle" />');
  syncEditor();notify("Doodle added to your note");
 }
 function clearDrawing(){const c=drawCanvasRef.current;completedStrokesRef.current=[];drawPointsRef.current=[];if(c){const ctx=c.getContext("2d");if(ctx)ctx.clearRect(0,0,c.width,c.height);}}
 async function getFirebaseIdToken(){
  if(!firebaseKey.trim())throw new Error("Add your Firebase Web API key in Settings first.");
  const cached=sessionStorage.getItem("arc-firebase-id-token");
  const cachedUntil=Number(sessionStorage.getItem("arc-firebase-token-expiry")||0);
  if(cached&&cachedUntil>Date.now()+60000)return cached;
  const response=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key="+encodeURIComponent(firebaseKey.trim()),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({returnSecureToken:true})});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error?.message==="OPERATION_NOT_ALLOWED"?"Enable Anonymous sign-in in Firebase Authentication.":data.error?.message||"Firebase sign-in failed.");
  sessionStorage.setItem("arc-firebase-id-token",data.idToken);
  sessionStorage.setItem("arc-firebase-token-expiry",String(Date.now()+Number(data.expiresIn||3600)*1000));
  return data.idToken as string;
 }
 function firebaseUid(token:string){try{return String(JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).sub||"")}catch{return ""}}
 async function persistNoteToCloud(note:Note,filePath?:string){
  const token=await getFirebaseIdToken();const uid=firebaseUid(token);if(!uid)throw new Error("Could not identify the signed-in cloud user.");
  const path=filePath||note.filePath||(uid+"/notes/"+note.id);
  const existing=await cloudRequest<any[]>(token,"notes?select=id,file_path&file_path=eq."+encodeURIComponent(path));
  const payload={title:note.title.slice(0,200),subject:note.subject.slice(0,100),content:note.body,file_path:path,updated_at:new Date().toISOString()};
  if(existing.length)await cloudRequest(token,"notes?id=eq."+encodeURIComponent(existing[0].id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify(payload)});
  else await cloudRequest(token,"notes",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify(payload)});
  return {token,uid};
 }
 async function syncNotesToCloud(){
  try{
   const firebaseToken=await getFirebaseIdToken();
   const existing=await cloudRequest<any[]>(firebaseToken,"notes?select=id,title,subject,content,file_path,updated_at");
   for(const note of notes){
    const filePath=note.filePath||(firebaseUid(firebaseToken)+"/notes/"+note.id);
    const payload={title:note.title,subject:note.subject,content:note.body,file_path:filePath,updated_at:new Date().toISOString()};
    const row=existing.find(item=>item.file_path===filePath);
    if(row){
     await cloudRequest(firebaseToken,"notes?id=eq."+encodeURIComponent(row.id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify(payload)});
    }else{
     await cloudRequest(firebaseToken,"notes",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify(payload)});
    }
   }
   notify("Cloud sync complete · "+notes.length+" notes backed up");
  }catch(error){notify(error instanceof Error?error.message:"Cloud sync failed");}
 }
 async function callArcAI(mode:"chat"|"summary"|"cards"|"kit",messages:{role:"user"|"assistant";content:string}[]=[],contextOverride?:string){
  setAiBusy(true);setAiError("");setAiResult("");
  try{
   const idToken=await getFirebaseIdToken();
   const context=(contextOverride||notes.map(n=>"TITLE: "+n.title+"\nSUBJECT: "+n.subject+"\n"+n.body.replace(/<[^>]*>/g," ")).join("\n\n")).slice(0,14000);
   const response=await fetch("https://oremmzzhmyhqqftexcor.supabase.co/functions/v1/arc",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+idToken},body:JSON.stringify({action:"ai",mode,context,messages})});
   const data=await response.json();
   if(!response.ok)throw new Error((data.error||"AI request failed ("+response.status+").")+(Array.isArray(data.missing)&&data.missing.length?" Missing configuration: "+data.missing.join(", "):""));
   const result=String(data.text||"").trim();
   if(!result)throw new Error("The AI returned an empty response. Please try again.");
   setAiResult(result);
   if(mode==="cards")saveFlashcardDeck(result);
   if(mode==="chat")setAiMessages(old=>[...old,{role:"assistant",content:result}]);
   return result;
  }catch(error){const message=error instanceof Error?error.message:"AI connection failed.";setAiError(message);return "";}
  finally{setAiBusy(false);}
 }

 function parseFlashcards(raw:string){
  try{
   const cleaned=raw.replace(/```(?:json)?/gi,"").replace(/```/g,"").trim();
   const parsed=JSON.parse(cleaned);
   const items=Array.isArray(parsed)?parsed:(parsed.cards||[]);
   return items.map((item:any)=>({front:String(item.front||item.question||item.q||"").trim(),back:String(item.back||item.answer||item.a||"").trim()})).filter((item:any)=>item.front&&item.back).slice(0,30);
  }catch{
   const matches=[...raw.matchAll(/(?:Q(?:uestion)?\s*[:.)-]\s*)([\s\S]*?)(?:\n\s*A(?:nswer)?\s*[:.)-]\s*)([\s\S]*?)(?=\n\s*Q(?:uestion)?\s*[:.)-]|$)/gi)];
   return matches.map(m=>({front:m[1].trim(),back:m[2].trim()})).filter(x=>x.front&&x.back).slice(0,30);
  }
 }
 async function askNoteCopilot(){
  const prompt=noteCopilotInput.trim();if(!prompt||!current||noteCopilotBusy)return;
  setNoteCopilotInput("");setNoteCopilotBusy(true);
  setNoteCopilotMessages(old=>[...old,{role:"user",content:prompt}]);
  const context="NOTE TITLE: "+current.title+"\nSUBJECT: "+current.subject+"\nCONTENT:\n"+(editorRef.current?.innerText||current.body.replace(/<[^>]*>/g," "));
  const answer=await callArcAI("chat",[{role:"user",content:prompt}],context);
  if(answer)setNoteCopilotMessages(old=>[...old,{role:"assistant",content:answer}]);
  setNoteCopilotBusy(false);
 }
 async function summarizeSelectedContent(){
  const selection=window.getSelection()?.toString().trim()||"";
  if(!selection){notify("Select some text inside this note first");return;}
  setSelectedSummary("Generating point-wise summary…");
  const result=await callArcAI("chat",[{role:"user",content:"Summarize ONLY the selected content. Return a clear title followed by concise bullet points. Preserve important facts and terminology.\n\nSELECTED CONTENT:\n"+selection}],selection);
  setSelectedSummary(result||"Summary could not be generated.");
 }
 function saveFlashcardDeck(raw:string){
  const cards=parseFlashcards(raw);
  if(!cards.length){notify("AI response did not contain readable flashcards. Try generating again.");return;}
  const deck={noteTitle:current?.title||"My study notes",cards,createdAt:new Date().toISOString()};
  setFlashcardDecks(old=>[deck,...old]);setActiveDeck(0);setFlippedCards({});setStudyIndex(0);setKnownCards({});setStudyMode("browse");setActive("Flashcards");notify(cards.length+" flashcards saved");
 }
 async function generateVisualization(){
  if(!notes.length){notify("Add or import notes before visualizing");return;}
  setVisualBusy(true);setVisualError("");setVisualization("");
  const source=noteKnowledge.length?noteKnowledge:notes.map(n=>({id:n.id,title:n.title,subject:n.subject,content:n.body.replace(/<[^>]*>/g," ")}));
  const context=source.map(n=>"NOTE: "+n.title+"\nSUBJECT: "+n.subject+"\nCONTENT:\n"+n.content).join("\n\n");
  const prompt="Read and understand the supplied notes as the only source. Create a complete visual explanation of the key topic relationships and process. Return (1) a short plain-language overview and (2) exactly one valid Mermaid flowchart using flowchart TD. Use simple node IDs (A, B, C), quote labels containing punctuation, avoid unsupported syntax, keep it readable (8-18 nodes), include definitions, sequence/relationships, and outcomes where the notes support them. Do not invent missing facts. If the notes cover multiple subjects, create a high-level map connecting their main topics. Put the Mermaid diagram in a ```mermaid code block.";
  const result=await callArcAI("chat",[{role:"user",content:prompt}],context.slice(0,14000));
  if(result)setVisualization(result);else setVisualError("Visualization could not be generated. Check the AI connection and try again.");
  setVisualBusy(false);
 }
 async function sendAIMessage(){
  const prompt=aiInput.trim();if(!prompt||aiBusy)return;
  const next=[...aiMessages,{role:"user" as const,content:prompt}];setAiMessages(next);setAiInput("");
  await callArcAI("chat",next);
 }
 function addChecklist(){
  editorRef.current?.focus();
  document.execCommand("insertHTML",false,'<ul class="task-list"><li><input type="checkbox"> <span>Task to complete</span></li><li><input type="checkbox"> <span>Another task</span></li></ul><p><br></p>');
  syncEditor();
 }
 const letterTemplates=[
  {title:"My Diary",category:"Personal · Diary",theme:"diary",body:"Dear Diary,\\n\\nToday I want to remember…\\n\\nThe best part of my day was…\\n\\nSomething I learned about myself…\\n\\nTomorrow, I hope to…\\n\\nWith love,\\nMe"},
  {title:"Love Letter",category:"Personal · Love",theme:"love",body:"My dearest [Name],\\n\\nThere are so many things I want you to know, but I will begin with this: you make ordinary moments feel special.\\n\\nOne of my favourite memories with you is [shared memory]. I appreciate your [quality] and the way you [small detail].\\n\\nI hope we keep making beautiful memories together.\\n\\nWith all my love,\\n[Your name]"},
  {title:"Friendship Letter",category:"Personal · Friendship",theme:"friendship",body:"Hey [Friend's name],\\n\\nI just wanted to remind you how much your friendship means to me. From [funny memory] to the times you supported me through [moment], I am grateful to have you in my life.\\n\\nThank you for being someone I can laugh with, learn with and count on. Let's make more memories soon!\\n\\nYour friend,\\n[Your name]"},
  {title:"Romantic Note",category:"Personal · Romantic",theme:"romantic",body:"To my favourite person,\\n\\nIf I could pause one moment, it would be [special moment] with you. Your [quality] brings warmth to my days, and even the simplest things feel wonderful when we share them.\\n\\nA little promise: I will keep choosing kindness, honesty and time together.\\n\\nYours,\\n[Your name]"},
  {title:"Formal business letter",category:"Business",body:"[Your name]\n[Your address]\n[City, PIN]\n[Email] · [Phone]\n\n[Date]\n\n[Recipient name]\n[Designation]\n[Organization]\n[Address]\n\nSubject: [Clear subject]\n\nDear [Recipient name],\n\nI am writing to [state your purpose clearly]. [Provide the key details, context and any relevant dates.]\n\nI would appreciate your consideration of this request. Please let me know if you need any further information.\n\nYours sincerely,\n[Your name]"},
  {title:"Job application cover letter",category:"Career",body:"[Your name] · [Phone] · [Email] · [LinkedIn]\n[Date]\n\nHiring Manager\n[Company name]\n\nSubject: Application for [Job title]\n\nDear Hiring Manager,\n\nI am applying for the [Job title] position at [Company]. My experience with [relevant skills] and work on [relevant project] have prepared me to contribute to your team.\n\nIn [project or internship], I [specific achievement with evidence]. I am particularly interested in [specific reason related to the company or role].\n\nThank you for considering my application. I would welcome the opportunity to discuss my fit for this role.\n\nSincerely,\n[Your name]"},
  {title:"Resignation letter",category:"Career",body:"[Your name]\n[Date]\n\n[Manager name]\n[Company]\n\nSubject: Formal resignation\n\nDear [Manager name],\n\nPlease accept this letter as formal notice of my resignation from my position as [Role] at [Company], effective [Last working day].\n\nThank you for the opportunities and support during my time here. I will do my best to ensure a smooth handover of my responsibilities.\n\nSincerely,\n[Your name]"},
  {title:"Leave request",category:"Work / Education",body:"[Your name]\n[Date]\n\nTo: [Manager / Faculty name]\nSubject: Request for leave from [Start date] to [End date]\n\nDear [Name],\n\nI request leave for [number] day(s), from [start date] through [end date], due to [brief reason]. I will complete or hand over any pending responsibilities before my leave.\n\nKindly approve my request.\n\nRegards,\n[Your name]"},
  {title:"Recommendation letter",category:"Education / Career",body:"[Date]\n\nTo Whom It May Concern,\n\nI am pleased to recommend [Candidate name] for [role / program]. I have known [Candidate] in my capacity as [relationship] for [duration].\n\nDuring this time, [Candidate] demonstrated [specific strengths], particularly through [specific example]. I believe these qualities make [Candidate] a strong fit for [opportunity].\n\nPlease contact me if further information is required.\n\nSincerely,\n[Recommender name]\n[Title / Organization]"},
  {title:"Complaint / service request",category:"Customer service",body:"[Your name and contact details]\n[Date]\n\nTo: [Company / Department]\n\nSubject: Complaint regarding [product / service / reference number]\n\nDear Customer Support Team,\n\nI am writing to report an issue with [brief description]. The issue occurred on [date] and the relevant reference is [order / ticket number].\n\nI request [specific resolution]. Please confirm the next steps and expected timeline. I have included [supporting documents] for reference.\n\nRegards,\n[Your name]"}
 ];
 function useLetterTemplate(template:{title:string;category:string;body:string;theme?:string}){
  const id=Date.now()+Math.random();const n:Note={id,title:template.title,subject:"Letter template · "+template.category,updated:"Just now",color:template.theme?"theme-"+template.theme:"violet",excerpt:"Editable letter template — replace the bracketed placeholders.",body:template.body.replace(/\\n/g,"<br>").replace(/\n/g,"<br>")};
  setNotes(old=>[n,...old]);setSelected(id);setActive("Editor");notify("Template added to My Notes");
 }
 async function importTemplateFromUrl(){
  const url=templateUrl.trim();if(!/^https?:\/\//i.test(url)){notify("Enter a valid public http or https URL");return}
  setTemplateBusy(true);
  try{
   const response=await fetch(url);if(!response.ok)throw new Error("The source returned "+response.status);
   const type=response.headers.get("content-type")||"";
   const raw=await response.text();
   const doc=type.includes("html")?new DOMParser().parseFromString(raw,"text/html"):null;
   const body=doc?(doc.body.innerText||doc.body.textContent||""):raw;
   const clean=body.trim().slice(0,30000);if(!clean)throw new Error("No readable text was found at that URL.");
   const id=Date.now()+Math.random();const n:Note={id,title:((doc?.title)||"Imported letter template").slice(0,100),subject:"Imported web template",updated:"Just now",color:"blue",excerpt:clean.slice(0,110),body:clean};
   setNotes(old=>[n,...old]);setTemplateUrl("");notify("Web template imported");
  }catch(error){notify(error instanceof Error?error.message+" (The website may block browser imports.)":"Could not import this URL");}
  finally{setTemplateBusy(false);}
 }

 function syncEditor(){if(editorRef.current){editorRef.current.querySelectorAll('input[type="checkbox"]').forEach((box)=>{(box as HTMLInputElement).toggleAttribute("checked",(box as HTMLInputElement).checked)});setDraft(cleanEditorHTML(editorRef.current.innerHTML));}}
 function format(command:string,value?:string){editorRef.current?.focus();document.execCommand(command,false,value);syncEditor();}
 function insertShape(shape:string){
  editorRef.current?.focus();
  const html=shape==="circle"?"<span style='display:inline-block;width:22px;height:22px;border:2px solid #a994ff;border-radius:50%;vertical-align:middle;margin:0 5px'></span>":shape==="square"?"<span style='display:inline-block;width:22px;height:22px;border:2px solid #a994ff;vertical-align:middle;margin:0 5px'></span>":"<span style='display:inline-block;color:#a994ff;font-size:26px;vertical-align:middle;margin:0 5px'>▲</span>";
  document.execCommand("insertHTML",false,html);syncEditor();
 }
 function noteThemeColors(){const map:Record<string,{paper:string;ink:string;rule:string;accent:string}>={diary:{paper:"#fbf2df",ink:"#574832",rule:"#d8c9ad",accent:"#8b7355"},love:{paper:"#fff0f4",ink:"#6b344a",rule:"#e7c3cf",accent:"#c56d8d"},friendship:{paper:"#eff9f2",ink:"#355b49",rule:"#c5dfd0",accent:"#5b9276"},romantic:{paper:"#f9eff8",ink:"#634b68",rule:"#ddc9df",accent:"#9874a0"}};return map[current?.color.replace("theme-","")||""]||{paper:"#ffffff",ink:"#222222",rule:"#e6e6e6",accent:"#514274"};}
 function notePlainText(){const html=editorRef.current?.innerHTML||current?.body||draft;const doc=new DOMParser().parseFromString(html,"text/html");return (doc.body.innerText||doc.body.textContent||"").replace(/\u00a0/g," ").trim();}
 function downloadBlob(blob:Blob,filename:string){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1200);}
 async function downloadNoteDocx(){
  if(!current)return;syncEditor();const colors=noteThemeColors(),html=editorRef.current?.innerHTML||current.body,doc=new DOMParser().parseFromString(html,"text/html");
  const esc=(v:string)=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const paragraphs=Array.from(doc.body.querySelectorAll("p,div,h1,h2,h3,li,blockquote")).map(el=>{const text=(el as HTMLElement).innerText||el.textContent||"";if(!text.trim())return "<w:p/>";const heading=/^H[1-3]$/.test(el.tagName);return "<w:p><w:pPr>"+(heading?"<w:pStyle w:val=\"Heading"+el.tagName.slice(1)+"\"/>":"")+"</w:pPr><w:r><w:rPr><w:color w:val=\""+colors.ink.replace("#","")+"\"/></w:rPr><w:t xml:space=\"preserve\">"+esc(text)+"</w:t></w:r></w:p>";});
  if(!paragraphs.length)paragraphs.push("<w:p><w:r><w:t>"+esc(notePlainText())+"</w:t></w:r></w:p>");
  const zip=new JSZip();
  zip.file("[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.folder("_rels")!.file(".rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.folder("word")!.file("document.xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:background w:color="'+colors.paper.replace("#","")+'"/><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="34"/><w:color w:val="'+colors.ink.replace("#","")+'"/></w:rPr><w:t>'+esc(titleDraft||current.title)+'</w:t></w:r></w:p>'+paragraphs.join("")+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr></w:body></w:document>');
  zip.folder("word")!.file("styles.xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="34"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style></w:styles>');
  const blob=await zip.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});downloadBlob(blob,(titleDraft||current.title||"ARC-Note").replace(/[^a-z0-9-_ ]/gi,"").trim()+".docx");notify("Word document downloaded");
 }
 function downloadNotePdf(){
  if(!current)return;syncEditor();const colors=noteThemeColors(),pdf=new jsPDF({unit:"mm",format:"a4"}),plain=notePlainText(),lines=pdf.splitTextToSize(plain,170);const title=titleDraft||current.title;
  const drawPage=()=>{pdf.setFillColor(colors.paper);pdf.rect(0,0,210,297,"F");pdf.setDrawColor(colors.rule);for(let y=35;y<282;y+=8)pdf.line(16,y,194,y);pdf.setTextColor(colors.ink);pdf.setFont("helvetica","bold");pdf.setFontSize(19);pdf.text(title,16,23);pdf.setFont("helvetica","normal");pdf.setFontSize(10);pdf.text(current.subject||"ARC AI Notes",16,29);pdf.setFontSize(11);};
  drawPage();let y=43;for(const line of lines){if(y>280){pdf.addPage();drawPage();y=43;}pdf.text(String(line),16,y);y+=8;}
  pdf.save((title||"ARC-Note").replace(/[^a-z0-9-_ ]/gi,"").trim()+".pdf");notify("PDF downloaded");
 }
 async function saveNote(){if(!current)return;syncEditor();const body=editorRef.current?cleanEditorHTML(editorRef.current.innerHTML):draft;const title=titleDraft.trim()||"Untitled note";const updated={...current,title,body,excerpt:body.replace(/[#*\\n]/g," ").slice(0,110),updated:"Just now"};setNotes(old=>old.map(n=>n.id===current.id?updated:n));try{await persistNoteToCloud(updated);notify("Note saved on this device and Supabase")}catch(error){notify("Saved locally; Supabase sync failed: "+(error instanceof Error?error.message:"connection error"))}}
 function createNote(){const id=Date.now();const n:Note={id,title:"Untitled note",subject:"Unsorted",updated:"Just now",color:"violet",excerpt:"Start writing your ideas…",body:""};setNotes(old=>[n,...old]);setSelected(id);setActive("Editor")}
 async function extractDocumentText(file:File):Promise<{text:string;kind:string;extractable:boolean}>{
  const ext=file.name.split(".").pop()?.toLowerCase()||"";
  const maxBytes=50*1024*1024;
  if(file.size>maxBytes)throw new Error("File exceeds the 50 MB import limit.");
  if(["txt","md","markdown","csv","json","html","htm","xml","log","yaml","yml","rtf"].includes(ext)){
   let text=await file.text();
   if(["html","htm"].includes(ext)){const doc=new DOMParser().parseFromString(text,"text/html");text=doc.body.innerText||doc.body.textContent||"";}
   if(ext==="json"){try{text=JSON.stringify(JSON.parse(text),null,2)}catch{}}
   return{text,kind:ext.toUpperCase(),extractable:true};
  }
  if(ext==="pdf"){
   const pdf=await getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
   const pages:string[]=[];
   for(let pageNo=1;pageNo<=Math.min(pdf.numPages,150);pageNo++){const page=await pdf.getPage(pageNo);const content=await page.getTextContent();pages.push(content.items.map((item:any)=>"str" in item?item.str:"").join(" "));}
   return{text:pages.join("\n\n"),kind:"PDF",extractable:true};
  }
  if(ext==="docx"){
   const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
   return{text:result.value,kind:"DOCX",extractable:true};
  }
  if(["xlsx","xls"].includes(ext)){
   const workbook=XLSX.read(await file.arrayBuffer(),{type:"array"});
   const text=workbook.SheetNames.map(name=>"SHEET: "+name+"\n"+XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join("\n\n");
   return{text,kind:ext.toUpperCase(),extractable:true};
  }
  if(ext==="pptx"){
   const zip=await JSZip.loadAsync(file);
   const slides=Object.keys(zip.files).filter(path=>/^ppt\/slides\/slide\d+\.xml$/.test(path)).sort((a,b)=>Number(a.match(/slide(\d+)/)?.[1])-Number(b.match(/slide(\d+)/)?.[1]));
   const textParts:string[]=[];
   for(let i=0;i<slides.length;i++){const xml=await zip.file(slides[i])?.async("text")||"";const values=[...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m=>m[1].replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">"));textParts.push("SLIDE "+(i+1)+"\n"+values.join(" "));}
   return{text:textParts.join("\n\n"),kind:"PPTX",extractable:true};
  }
  if(ext==="odt"||ext==="epub"){
   const zip=await JSZip.loadAsync(file);
   const paths=ext==="odt"?["content.xml"]:Object.keys(zip.files).filter(x=>/\.(xhtml|html|htm)$/i.test(x));
   const parts:string[]=[];
   for(const path of paths){const raw=await zip.file(path)?.async("text");if(raw){const doc=new DOMParser().parseFromString(raw,"text/html");parts.push(doc.body.innerText||doc.body.textContent||raw.replace(/<[^>]+>/g," "));}}
   return{text:parts.join("\n\n"),kind:ext.toUpperCase(),extractable:true};
  }
  if(["png","jpg","jpeg","webp","bmp","tif","tiff"].includes(ext)){
   const worker=await createWorker("eng");
   try{const result=await worker.recognize(await file.arrayBuffer());return{text:result.data.text.trim(),kind:"IMAGE OCR",extractable:true};}
   finally{await worker.terminate();}
  }
  if(["mp3","wav","m4a","aac","ogg","mp4","mov","webm","avi"].includes(ext)){
   return{text:"Media file attached to library: "+file.name+"\nSize: "+file.size.toLocaleString()+" bytes\n\nAutomatic transcription is not enabled yet. Use an audio/video transcription tool to convert this media into text.",kind:ext.toUpperCase()+" MEDIA",extractable:false};
  }
  return{text:"File indexed: "+file.name+"\nType: "+(file.type||ext||"unknown")+"\nSize: "+file.size.toLocaleString()+" bytes\n\nThis binary format is stored as a library reference only; text extraction is not available in the browser build.",kind:ext.toUpperCase()||"FILE",extractable:false};
 }
 async function importFiles(e:ChangeEvent<HTMLInputElement>){
  const files=Array.from(e.target.files||[]);
  for(const file of files){
   try{
    const result=await extractDocumentText(file);
    const id=Date.now()+Math.random();
    const token=await getFirebaseIdToken();const uid=firebaseUid(token);if(!uid)throw new Error("Could not identify cloud user.");
    const storagePath=await uploadUserFile(token,file,uid);
    const note:Note={id,title:file.name.replace(/\.[^.]+$/,""),subject:"Imported · "+result.kind,updated:"Just now",color:"blue",excerpt:(result.text||"Original file stored in Supabase Storage").slice(0,110),body:result.extractable?result.text:"Original file stored securely in Supabase Storage. Download the source from the Library.",filePath:storagePath};
    await persistNoteToCloud(note);
    setNotes(old=>[note,...old]);
    notify("Uploaded "+file.name+" to Supabase Storage");
   }catch(error){notify(file.name+": "+(error instanceof Error?error.message:"could not be read"))}
  }
  e.target.value="";
 }
 async function importZip(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0]; if(!file)return;
  setArchiveBusy(true);setArchiveError("");setArchive([]);setArchiveSelected("");setArchiveName(file.name);
  try{
   if(file.size>100*1024*1024)throw new Error("ZIP is larger than 100 MB. Please split it into smaller archives.");
   const zip=await JSZip.loadAsync(file,{checkCRC32:true});
   const all=Object.values(zip.files).filter(f=>!f.dir);
   if(all.length>1500)throw new Error("This archive contains more than 1,500 files. Please split it into smaller ZIP files.");
   const entries:ArchiveEntry[]=[];
   for(const item of all){
    const path=item.name;
    if(path.startsWith("__MACOSX/")||path.split("/").some(p=>p==="."||p===".."))continue;
    const ext=path.split(".").pop()?.toLowerCase()||"";
    let supported=["txt","md","markdown","csv","json","html","htm","xml","log","yaml","yml","rtf","docx","pdf","xlsx","xls","pptx","odt","epub","png","jpg","jpeg","webp","bmp","tif","tiff"].includes(ext);
    const size=(item as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize||0;
    let body="";let kind=ext.toUpperCase()||"FILE";
    if(supported){
     if(size>8*1024*1024){body="[Skipped: file exceeds 8 MB text extraction limit]";supported=false;}
     else{
      try{const result=await extractDocumentText(new File([await item.async("blob")],path));body=result.text;kind=result.kind;supported=result.extractable;}
      catch(error){body=error instanceof Error?error.message:"Extraction failed";supported=false;}
     }
    }
    entries.push({path,size,kind,text:body,supported});
   }
   setArchive(entries);setArchiveSelected(entries.find(x=>x.supported)?.path||entries[0]?.path||"");
   if(!entries.length)throw new Error("No files were found inside this ZIP archive.");
   notify("ZIP opened · "+entries.length+" files found");
  }catch(err){setArchiveError(err instanceof Error?err.message:"Could not open this ZIP file.");}
  finally{setArchiveBusy(false);e.target.value=""}
 }
 function extractArchiveEntry(entry:ArchiveEntry){
  if(!entry.supported||!entry.text||entry.text.startsWith("[Skipped:")){notify("This file type cannot be extracted as editable text yet");return}
  const id=Date.now()+Math.random();const leaf=entry.path.split("/").pop()||entry.path;
  setNotes(old=>[{id,title:leaf.replace(/\\.[^.]+$/,""),subject:"ZIP · "+entry.path.split("/").slice(0,-1).join("/"),updated:"Just now",color:"blue",excerpt:entry.text.slice(0,110),body:entry.text},...old]);
  notify("Extracted "+leaf+" into My Notes");
 }
 function extractAllSupported(){
  const ready=archive.filter(x=>x.supported&&x.text&&!x.text.startsWith("[Skipped:"));
  if(!ready.length){notify("No supported text documents found");return}
  const additions=ready.map((entry,index)=>{const leaf=entry.path.split("/").pop()||entry.path;return{id:Date.now()+index+Math.random(),title:leaf.replace(/\\.[^.]+$/,""),subject:"ZIP · "+entry.path.split("/").slice(0,-1).join("/"),updated:"Just now",color:"blue",excerpt:entry.text.slice(0,110),body:entry.text} as Note});
  setNotes(old=>[...additions,...old]);notify("Extracted "+additions.length+" documents into My Notes");
 }
 function exportNote(){if(!current)return;const blob=new Blob([draft],{type:"text/markdown"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=(titleDraft||"arc-note")+".md";a.click();URL.revokeObjectURL(url)}
 function deleteNote(){if(!current)return;setNotes(old=>old.filter(n=>n.id!==current.id));setSelected(null);setActive("My Notes");notify("Note deleted")}
 return <div className="app-shell">
 <aside className={`sidebar ${mobileNav?"sidebar-open":""}`}>
  <div className="brand-row"><div className="brand-mark" aria-hidden="true"><svg viewBox="0 0 48 48" role="img"><defs><linearGradient id="arcNoteGradient" x1="5" y1="4" x2="43" y2="44" gradientUnits="userSpaceOnUse"><stop stopColor="#B9A7FF"/><stop offset="1" stopColor="#7355E8"/></linearGradient></defs><rect x="5" y="4" width="31" height="39" rx="7" fill="url(#arcNoteGradient)"/><path d="M27 4v10a4 4 0 0 0 4 4h5" fill="#EDE8FF" opacity=".9"/><path d="M12 22h16M12 28h13M12 34h9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/><path d="m37 25 1.8 4.2L43 31l-4.2 1.8L37 37l-1.8-4.2L31 31l4.2-1.8L37 25Z" fill="#E9E1FF" stroke="#7355E8" strokeWidth=".8"/></svg></div><span className="brand-name">ARC <span>AI</span><small>NOTES</small></span><button className="icon-button mobile-close" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
  <button className="workspace-switch"><div className="workspace-avatar">R</div><span><strong>My workspace</strong><small>Personal workspace · Supabase cloud</small></span><ChevronDown size={15}/></button>
  <button className="new-note-button" onClick={createNote}><Plus size={17}/> Create new note <span>⌘ N</span></button>
  <div className="nav-caption">WORKSPACE</div><nav className="main-nav">{navItems.map(({label,icon:Icon})=><button key={label} className={`nav-item ${active===label?"active":""}`} onClick={()=>{setActive(label);setSelected(null);setMobileNav(false)}}><Icon size={17}/><span>{label}</span>{label==="AI Study Room"&&<span className="nav-new">BETA</span>}</button>)}</nav>
  <div className="nav-caption collections-caption">YOUR COLLECTIONS <button aria-label="Add collection"><Plus size={14}/></button></div>
  <button className="collection-item"><span className="collection-dot dot-purple"/> Semester 5</button><button className="collection-item"><span className="collection-dot dot-blue"/> Exam preparation</button><button className="collection-item"><span className="collection-dot dot-orange"/> Project research</button>
  <div className="sidebar-bottom"><div className="storage-card"><div className="storage-heading"><span>Cloud + device storage</span><span>SUPABASE</span></div><div className="storage-track"><i/></div><small>Saved notes and imported files sync to your private cloud</small></div><button className={`nav-item ${active==="Settings"?"active":""}`} onClick={()=>{setActive("Settings");setSelected(null);setMobileNav(false)}}><Settings2 size={17}/><span>Settings</span></button><div className="profile-row"><div className="profile-avatar">R</div><span><strong>Rohith</strong><small>Personal workspace</small></span><MoreHorizontal size={18}/></div></div>
 </aside>
 {mobileNav&&<button className="mobile-scrim" onClick={()=>setMobileNav(false)} aria-label="Close menu"/>}
 <main className="main-area">
  <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={()=>setMobileNav(true)}><Menu size={19}/></button><span>Workspace</span><span className="crumb-slash">/</span><strong>{active}</strong></div><div className="topbar-actions"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search notes…"/><kbd>⌘ K</kbd></label><button className="icon-button" onClick={()=>setTheme(theme==="dark"?"light":"dark")} aria-label={theme==="dark"?"Switch to light theme":"Switch to dark theme"} title={theme==="dark"?"Light theme":"Dark theme"}>{theme==="dark"?<Sun size={18}/>:<Moon size={18}/>}</button><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18}/></button><div className="top-avatar">R</div></div></header>
  <div className="page-content">
  {active==="Editor"&&current?<><div className="editor-toolbar"><button className="text-button" onClick={()=>{setSelected(null);setActive("My Notes")}}><ArrowLeft size={15}/> All notes</button><div className="editor-actions"><span className="save-status"><Check size={13}/> Saved locally when you click Save</span><button className="secondary-button" onClick={exportNote}><Download size={15}/> Export .md</button><button className="secondary-button danger-button" onClick={deleteNote}><Trash2 size={15}/></button><button className="primary-button" onClick={saveNote}>Save note <Check size={15}/></button></div></div><div className="note-workspace"><div className="editor-wrap"><div className="rich-toolbar" role="toolbar" aria-label="Note formatting toolbar"><div className="tool-group"><button type="button" title="Bold" onMouseDown={e=>e.preventDefault()} onClick={()=>format("bold")}><Bold size={16}/></button><button type="button" title="Italic" onMouseDown={e=>e.preventDefault()} onClick={()=>format("italic")}><Italic size={16}/></button><button type="button" title="Underline" onMouseDown={e=>e.preventDefault()} onClick={()=>format("underline")}><Underline size={16}/></button><button type="button" title="Strikethrough" onMouseDown={e=>e.preventDefault()} onClick={()=>format("strikeThrough")}><Strikethrough size={16}/></button></div><div className="tool-group doodle-nav-group"><button type="button" className={isDoodleMode?"active-tool":""} title="Draw directly on the note" onMouseDown={e=>e.preventDefault()} onClick={()=>setIsDoodleMode(v=>!v)}><Pencil size={15}/> Doodle</button>{isDoodleMode&&<><label className="doodle-ink-control" title="Ink colour"><input aria-label="Doodle ink colour" type="color" value={drawColor} onChange={e=>setDrawColor(e.target.value)}/></label><button type="button" title="Done drawing and insert into note" onClick={completeDoodle}><Check size={15}/> Done</button><button type="button" title="Cancel drawing" onClick={cancelDoodle}><X size={14}/> Cancel</button></>}</div><div className="tool-group"><select aria-label="Font family" defaultValue="Arial" onChange={e=>format("fontName",e.target.value)}><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Courier New">Courier New</option><option value="Trebuchet MS">Trebuchet</option><option value="Times New Roman">Times New Roman</option></select><select aria-label="Text size" defaultValue="3" onChange={e=>format("fontSize",e.target.value)}><option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">XL</option><option value="6">XXL</option></select></div><div className="tool-group color-tool"><label title="Text color">A<input aria-label="Text color" type="color" defaultValue="#d5d7e0" onChange={e=>format("foreColor",e.target.value)}/></label><label title="Highlight color"><Highlighter size={15}/><input aria-label="Highlight color" type="color" defaultValue="#6550a4" onChange={e=>format("hiliteColor",e.target.value)}/></label></div><div className="tool-group"><button type="button" title="Align left" onMouseDown={e=>e.preventDefault()} onClick={()=>format("justifyLeft")}><AlignLeft size={16}/></button><button type="button" title="Align center" onMouseDown={e=>e.preventDefault()} onClick={()=>format("justifyCenter")}><AlignCenter size={16}/></button><button type="button" title="Align right" onMouseDown={e=>e.preventDefault()} onClick={()=>format("justifyRight")}><AlignRight size={16}/></button></div><div className="tool-group"><button type="button" title="Bulleted list" onMouseDown={e=>e.preventDefault()} onClick={()=>format("insertUnorderedList")}><List size={16}/></button><button type="button" title="Numbered list" onMouseDown={e=>e.preventDefault()} onClick={()=>format("insertOrderedList")}><ListOrdered size={16}/></button><button type="button" title="Insert task checklist" onMouseDown={e=>e.preventDefault()} onClick={addChecklist}><CheckSquare size={16}/></button><button type="button" title="Block quote" onMouseDown={e=>e.preventDefault()} onClick={()=>format("formatBlock","blockquote")}>❞</button></div><div className="tool-group"><button type="button" className={showRuler?"active-tool":""} title="Toggle ruler" onMouseDown={e=>e.preventDefault()} onClick={()=>setShowRuler(v=>!v)}>Ruler</button></div><div className="tool-group shape-tools"><span>Shapes</span><button type="button" title="Insert circle" onMouseDown={e=>e.preventDefault()} onClick={()=>insertShape("circle")}>○</button><button type="button" title="Insert square" onMouseDown={e=>e.preventDefault()} onClick={()=>insertShape("square")}>□</button><button type="button" title="Insert triangle" onMouseDown={e=>e.preventDefault()} onClick={()=>insertShape("triangle")}>△</button></div><div className="tool-group export-tools"><button type="button" title="Download editable Word document" onMouseDown={e=>e.preventDefault()} onClick={()=>downloadNoteDocx()}><Download size={14}/> DOCX</button><button type="button" title="Download PDF" onMouseDown={e=>e.preventDefault()} onClick={()=>downloadNotePdf()}><Download size={14}/> PDF</button></div></div>{showRuler&&<div className="editor-ruler" aria-label="Document ruler"><div className="ruler-scale">{Array.from({length:17},(_,i)=><span className="ruler-tick" key={i}><i/>{i%2===0?<small>{i}</small>:null}</span>)}</div><span className="ruler-indent" style={{left:rulerIndent+"%"}}/><span className="ruler-indent right" style={{right:rightIndent+"%"}}/><input className="ruler-margin-control" aria-label="Adjust left writing margin" type="range" min="4" max="35" value={rulerIndent} onChange={e=>setRulerIndent(Math.min(Number(e.target.value),80-rightIndent))}/><input className="ruler-margin-control ruler-right-control" aria-label="Adjust right writing margin" type="range" min="4" max="35" value={rightIndent} onChange={e=>setRightIndent(Math.min(Number(e.target.value),80-rulerIndent))}/></div>}<div className={"stationery-page "+(current.color.startsWith("theme-")?current.color:"")}><input className="editor-title" value={titleDraft} onChange={e=>setTitleDraft(e.target.value)} placeholder="Untitled note"/><div className="editor-meta"><span>{current.subject}</span><span>Rich text editor · Save to keep changes</span></div><div className="writing-surface"><div ref={editorRef} style={{paddingLeft:rulerIndent+"%",paddingRight:rightIndent+"%"}} className="note-editor rich-editor" contentEditable={!isDoodleMode} suppressContentEditableWarning role="textbox" aria-label="Note content" aria-multiline="true" data-placeholder="Start writing your notes here…" onInput={syncEditor} onBlur={syncEditor}/>{isDoodleMode&&<canvas ref={drawCanvasRef} className="doodle-overlay" width={1000} height={900} onPointerDown={startDrawing} onPointerMove={moveDrawing} onPointerUp={finishDrawing} onPointerCancel={finishDrawing} onLostPointerCapture={()=>finishDrawing()}/>}</div></div></div><aside className="note-copilot"><div className="note-copilot-head"><div className="ai-setup-icon"><BrainCircuit size={20}/></div><div><h3>ARC Copilot</h3><p>Focused on this note only</p></div></div><button className="secondary-button selected-summary-button" onClick={summarizeSelectedContent}><Sparkles size={14}/> Summarize selected text</button>{selectedSummary&&<div className="selected-summary"><strong>Point-wise summary</strong><pre>{selectedSummary}</pre></div>}<div className="note-copilot-thread">{noteCopilotMessages.length?noteCopilotMessages.map((m,i)=><div className={"ai-message "+m.role} key={i}><strong>{m.role==="user"?"You":"ARC Copilot"}</strong><p>{m.content}</p></div>):<div className="ai-chat-empty"><Sparkles size={20}/><strong>Ask about this note</strong><span>Explain a concept, find key points, or clarify a paragraph.</span></div>}{noteCopilotBusy&&<div className="archive-status"><span className="spinner"/> Thinking…</div>}</div><form className="ai-compose note-copilot-compose" onSubmit={e=>{e.preventDefault();void askNoteCopilot()}}><input value={noteCopilotInput} onChange={e=>setNoteCopilotInput(e.target.value)} placeholder="Ask about this note…" disabled={noteCopilotBusy}/><button className="primary-button" type="submit" disabled={noteCopilotBusy||!noteCopilotInput.trim()}><Send size={15}/></button></form></aside></div></>:active==="AI Study Room"?<section className="module-page"><div className="eyebrow"><span className="live-dot"/> SECURE AI STUDY COPILOT</div><h1>AI Study Room</h1><p>Ask questions, summarize your notes and create revision material grounded in your library.</p><div className="ai-action-row"><button className="primary-button" onClick={()=>callArcAI("summary")} disabled={aiBusy}><Sparkles size={15}/> Summarize all notes</button><button className="secondary-button" onClick={()=>callArcAI("cards")} disabled={aiBusy}><GraduationCap size={15}/> Generate flashcards</button><button className="secondary-button" onClick={()=>callArcAI("kit",[{role:"user",content:"Build a complete study kit using ONLY the supplied notes. Organize it into: topic-by-topic beginner explanations, key definitions, step-by-step processes, important points, examples present in the notes, short-answer questions with answers, long-answer questions with structured answers, and a final revision checklist. Preserve the source notes terminology and do not invent facts. If information is missing, clearly say it is not covered in the notes."}])} disabled={aiBusy}><ClipboardList size={15}/> Build study kit</button><button className="secondary-button" onClick={()=>void generateVisualization()} disabled={aiBusy||visualBusy}><Workflow size={15}/> {visualBusy?"Visualizing…":"Visualize notes"}</button></div><div className="knowledge-status"><span className="live-dot"/> Local note index refreshes every 2.5 seconds · {noteKnowledge.length} notes ready for AI context</div>{visualError&&<div className="archive-error">{visualError}</div>}{visualization&&<div className="visualization-card"><div className="section-heading"><div><h3><Workflow size={18}/> Visual explanation</h3><p>Generated from your saved notes. Diagram and overview are based on your source content.</p></div><button className="text-button" onClick={()=>void generateVisualization()} disabled={visualBusy}><RefreshCw size={14}/> Regenerate</button></div><div className="visualization-overview">{visualization.replace(/```(?:mermaid)?[\s\S]*?```/gi,"").trim()}</div><div className="visualization-diagram" ref={visualDiagramRef}/><details className="visualization-source"><summary>View Mermaid source</summary><pre>{visualization.match(/```(?:mermaid)?\\s*([\\s\\S]*?)```/i)?.[1]||"No Mermaid source returned."}</pre></details></div>{!firebaseKey&&<div className="ai-setup-card"><div className="ai-setup-icon"><BrainCircuit size={25}/></div><div><h3>Connect your Firebase project</h3><p>Add the Firebase Web API key in Settings and enable Anonymous sign-in. AI calls are routed through the secured ARC Edge Function; no Groq key is exposed in the browser.</p><button className="secondary-button" onClick={()=>setActive("Settings")}>Open AI settings <ArrowRight size={14}/></button></div></div>}{aiError&&<div className="archive-error">{aiError}</div>}{aiBusy&&<div className="archive-status"><span className="spinner"/> ARC AI is reading your notes and preparing a response…</div>}{aiResult&&<div className="ai-result-card"><div className="section-heading"><div><h3>ARC AI response</h3><p>Generated from your saved notes and the current prompt.</p></div><button className="text-button" onClick={()=>{navigator.clipboard?.writeText(aiResult);notify("AI response copied")}}>Copy response</button></div><pre>{aiResult}</pre></div>}<div className="ai-chat-card"><div className="ai-chat-heading"><div className="ai-setup-icon"><BrainCircuit size={22}/></div><div><h3>Ask ARC AI</h3><p>Beginner-friendly explanations · Note-aware answers</p></div></div><div className="ai-messages">{aiMessages.length?aiMessages.map((m,i)=><div key={i} className={"ai-message "+m.role}><strong>{m.role==="user"?"You":"ARC AI"}</strong><p>{m.content}</p></div>):<div className="ai-chat-empty"><Sparkles size={22}/><strong>What would you like to understand?</strong><span>Try: “Explain compiler lexical analysis in simple steps.”</span></div>}</div><form className="ai-compose" onSubmit={e=>{e.preventDefault();void sendAIMessage()}}><input value={aiInput} onChange={e=>setAiInput(e.target.value)} placeholder="Ask a question about your notes…" disabled={aiBusy}/><button className="primary-button" type="submit" disabled={aiBusy||!aiInput.trim()}><Send size={16}/> Send</button></form></div></section>:active==="Flashcards"?<section className="module-page flashcards-page"><div className="eyebrow"><span className="live-dot"/> ACTIVE RECALL · SPACED PRACTICE</div><div className="flashcards-hero"><div><h1>Flashcards</h1><p>Learn actively. Reveal answers, test your recall and track what you know.</p></div><div className="flashcards-hero-mark"><GraduationCap size={30}/></div></div><div className="flashcards-toolbar"><div><span className="flashcards-label">CREATE A DECK</span><p>Generate focused cards from your current note.</p></div><button className="primary-button" onClick={()=>{if(!current){notify("Open a note first to generate its flashcards");return;}void callArcAI("cards",[{role:"user",content:"Create 8 high-quality concise flashcards from this note. Cover key definitions, concepts, processes and examples. Return ONLY valid JSON in this exact shape: [{\"front\":\"one clear question\",\"back\":\"concise accurate answer\"}]. Do not include markdown."}],current.title+"\n"+(editorRef.current?.innerText||current.body.replace(/<[^>]*>/g," ")))}} disabled={aiBusy}><Sparkles size={15}/>{aiBusy?"Creating deck…":"Generate from current note"}</button></div>{aiError&&<div className="archive-error">{aiError}</div>}{aiBusy&&<div className="archive-status"><span className="spinner"/> ARC AI is building and checking your cards…</div>}{flashcardDecks.length===0?<div className="empty-module flashcards-empty"><div className="flashcards-empty-icon"><GraduationCap size={34}/></div><h3>Your study space is ready</h3><p>Open a note, generate a deck, then practise with interactive cards and a quick recall quiz.</p></div>:<div className="flashcards-workspace"><aside className="deck-panel"><div className="deck-panel-heading"><div><span className="flashcards-label">YOUR LIBRARY</span><h3>Study decks</h3></div><span className="deck-count">{flashcardDecks.length}</span></div>{flashcardDecks.map((deck,i)=><button className={"deck-row "+(activeDeck===i?"selected":"")} key={deck.createdAt+i} onClick={()=>{setActiveDeck(i);setFlippedCards({});setStudyIndex(0);setKnownCards({});setStudyMode("browse")}}><span><strong>{deck.noteTitle}</strong><small>{deck.cards.length} cards · {new Date(deck.createdAt).toLocaleDateString()}</small></span><ArrowRight size={16}/></button>)}</aside>{activeDeck!==null&&flashcardDecks[activeDeck]&&(()=>{const deck=flashcardDecks[activeDeck];const card=deck.cards[studyIndex]||deck.cards[0];const flipped=!!flippedCards[studyIndex];const known=deck.cards.filter((_,i)=>knownCards[activeDeck+":"+i]).length;return <div className="study-panel"><div className="study-panel-top"><div><span className="flashcards-label">NOW STUDYING</span><h2>{deck.noteTitle}</h2></div><div className="study-mode-switch"><button className={studyMode==="browse"?"active":""} onClick={()=>setStudyMode("browse")}>Study</button><button className={studyMode==="quiz"?"active":""} onClick={()=>{setStudyMode("quiz");setFlippedCards({})}}>Quiz</button></div></div><div className="study-progress"><div><span>Card {studyIndex+1} of {deck.cards.length}</span><strong>{Math.round(((studyIndex+1)/deck.cards.length)*100)}%</strong></div><div className="study-progress-track"><span style={{width:((studyIndex+1)/deck.cards.length*100)+"%"}}/></div></div><button type="button" className={"study-flashcard premium-flashcard "+(flipped?"flipped":"")} onClick={()=>setFlippedCards(old=>({...old,[studyIndex]:!old[studyIndex]}))} aria-label={flipped?"Show question":"Reveal answer"}><span className="flashcard-inner"><span className="flashcard-face flashcard-front"><small>QUESTION · {studyIndex+1}/{deck.cards.length}</small><strong>{card.front}</strong><em><span>↻</span> Tap to reveal answer</em></span><span className="flashcard-face flashcard-back"><small>ANSWER · {studyIndex+1}/{deck.cards.length}</small><strong>{card.back}</strong><em>Tap to see question</em></span></span></button><div className="study-actions"><button className="secondary-button" onClick={()=>{setStudyIndex(i=>(i-1+deck.cards.length)%deck.cards.length);setFlippedCards({})}}> <ArrowLeft size={15}/> Previous</button><button className="secondary-button" onClick={()=>{setStudyIndex(i=>(i+1)%deck.cards.length);setFlippedCards({})}}>Next <ArrowRight size={15}/></button></div>{flipped&&<div className="recall-actions"><span>How well did you remember?</span><button onClick={()=>{setKnownCards(o=>({...o,[activeDeck+":"+studyIndex]:false}));setStudyIndex(i=>(i+1)%deck.cards.length);setFlippedCards({})}}> <X size={15}/> Need practice</button><button onClick={()=>{setKnownCards(o=>({...o,[activeDeck+":"+studyIndex]:true}));setStudyIndex(i=>(i+1)%deck.cards.length);setFlippedCards({})}}><Check size={15}/> I knew it</button></div>}<div className="study-footer"><span><Check size={14}/> {known} mastered</span><button className="text-button" onClick={()=>{setStudyIndex(0);setFlippedCards({});setKnownCards({})}}>Reset progress</button><button className="text-button" onClick={()=>{setStudyIndex(Math.floor(Math.random()*deck.cards.length));setFlippedCards({})}}> <Sparkles size={13}/> Random card</button></div></div>})()}</div>}</section>:active==="Letter Templates"?<section className="module-page"><div className="eyebrow"><span className="live-dot"/> DOCUMENT STARTERS</div><h1>Letter templates</h1><p>Start with an editable ARC template or bring in a public template you are allowed to reuse.</p><div className="template-grid">{letterTemplates.map(t=><article className={"template-card "+("theme" in t?"template-"+t.theme:"template-classic")} key={t.title}><div className="template-card-top"><span>{t.category}</span><FileText size={19}/></div><div className="template-preview" aria-hidden="true"><span className="template-preview-deco">{t.theme==="diary"?"✦":t.theme==="love"?"♡":t.theme==="friendship"?"✿":t.theme==="romantic"?"❀":"✉"}</span><span className="template-preview-lines"/><span className="template-preview-lines short"/></div><h3>{t.title}</h3><p>{("theme" in t)?"Decorative background · Fully editable in your note.":"Editable starter · Replace bracketed fields with your details."}</p><button className="primary-button" onClick={()=>useLetterTemplate(t)}>Use this template <ArrowRight size={14}/></button></article>)}</div><div className="web-template-card"><h3>Import a public template from the web</h3><p>Paste a direct public page URL. Pages that block browser access can still be opened from the source links below and copied into ARC.</p><div className="template-url-row"><input value={templateUrl} onChange={e=>setTemplateUrl(e.target.value)} placeholder="https://example.com/public-letter-template"/><button className="primary-button" onClick={importTemplateFromUrl} disabled={templateBusy||!templateUrl.trim()}>{templateBusy?"Importing…":"Import URL"}</button></div><div className="template-source-links"><a href="https://word.cloud.microsoft/create/en/letters-templates/" target="_blank" rel="noreferrer">Microsoft Word templates <ExternalLink size={13}/></a><a href="https://www.canva.com/letters/templates/business/" target="_blank" rel="noreferrer">Canva letter templates <ExternalLink size={13}/></a><a href="https://www.vertex42.com/WordTemplates/letters.html" target="_blank" rel="noreferrer">Vertex42 sample letters <ExternalLink size={13}/></a></div></div></section>:active==="Settings"?<section className="module-page"><div className="eyebrow"><span className="live-dot"/> WORKSPACE PREFERENCES</div><h1>Settings</h1><p>Manage appearance and connect your AI provider.</p><div className="settings-card"><div><h3>Appearance</h3><p>Choose the workspace colour scheme. Your choice is saved in this browser.</p></div><div className="theme-choice"><button className={theme==="dark"?"selected":""} onClick={()=>setTheme("dark")}><Moon size={18}/> Dark</button><button className={theme==="light"?"selected":""} onClick={()=>setTheme("light")}><Sun size={18}/> Light</button></div></div><div className="settings-card ai-settings"><div><h3>Firebase connection for ARC AI</h3><p>Enter the Firebase Web API key from Project settings → General → Your apps. This is a public client identifier, not a server secret. Enable Authentication → Sign-in method → Anonymous.</p></div><label>Firebase Web API key<input type="password" autoComplete="off" value={firebaseKey} onChange={e=>setFirebaseKey(e.target.value)} placeholder="AIza…"/></label><div className="settings-actions"><button className="primary-button" onClick={()=>{localStorage.setItem("arc-firebase-api-key",firebaseKey.trim());sessionStorage.removeItem("arc-firebase-id-token");sessionStorage.removeItem("arc-firebase-token-expiry");notify("Firebase settings saved on this device")}}>Save connection</button><button className="secondary-button" onClick={()=>callArcAI("summary")} disabled={aiBusy||!firebaseKey.trim()}>Test AI connection</button></div>{aiError&&<div className="archive-error">{aiError}</div>}{aiResult&&<div className="integration-tag">AI connection responded successfully</div>}</div><div className="settings-card"><div><h3>Cloud backup & sync</h3><p>Back up your notes to your private Supabase account. Your Firebase sign-in identity is exchanged for a short-lived, scoped Supabase session; server keys stay on the backend.</p></div><div className="settings-actions"><span className="integration-tag">Supabase database + private files bucket configured</span><button className="primary-button" onClick={syncNotesToCloud}>Sync notes to cloud</button></div></div></section>:active==="Library"?<section className="module-page"><div className="eyebrow"><span className="live-dot"/> DOCUMENT LIBRARY</div><div className="module-title-row"><div><h1>Library</h1><p>Bring your study material into ARC AI.</p></div><button className="primary-button" onClick={()=>fileRef.current?.click()}><UploadCloud size={16}/> Import files</button></div><input ref={fileRef} type="file" multiple accept="*/*" hidden onChange={importFiles}/><div className="import-grid"><button className="upload-panel" onClick={()=>fileRef.current?.click()}><UploadCloud size={27}/><h3>Import individual files</h3><p>PDF · DOCX · XLSX · PPTX · TXT · CSV · Images · EPUB · More</p><small>Files are converted into editable ARC notes.</small></button><label className="upload-panel zip-upload"><input type="file" accept=".zip,application/zip" hidden onChange={importZip}/><div className="zip-icon">ZIP</div><h3>Open a ZIP archive</h3><p>Upload a ZIP to inspect its folders and files.</p><small>Up to 100 MB · Up to 1,500 files</small></label></div>{archiveBusy&&<div className="archive-status"><span className="spinner"/> Reading archive and building file index…</div>}{archiveError&&<div className="archive-error">{archiveError}</div>}{archive.length>0&&<section className="archive-browser"><div className="archive-heading"><div><span className="archive-kicker">ARCHIVE EXPLORER</span><h3>{archiveName}</h3><p>{archive.length} files indexed · {archive.filter(x=>x.supported).length} extractable text documents</p></div><button className="primary-button" onClick={extractAllSupported}>Extract supported files <ArrowRight size={15}/></button></div><div className="archive-controls"><label className="archive-search"><Search size={15}/><input value={archiveFilter} onChange={e=>setArchiveFilter(e.target.value)} placeholder="Filter archive files…"/></label><span>{archive.filter(x=>x.path.toLowerCase().includes(archiveFilter.toLowerCase())).length} shown</span></div><div className="archive-layout"><div className="archive-tree">{archive.filter(x=>x.path.toLowerCase().includes(archiveFilter.toLowerCase())).map(entry=><button key={entry.path} className={`archive-file ${archiveSelected===entry.path?"selected":""}`} onClick={()=>setArchiveSelected(entry.path)}><FileText size={15}/><span>{entry.path}</span><small>{entry.kind}</small></button>)}</div><div className="archive-preview">{(()=>{const entry=archive.find(x=>x.path===archiveSelected);return entry?<><div className="preview-file-head"><div><strong>{entry.path.split("/").pop()}</strong><small>{entry.path} · {entry.size.toLocaleString()} bytes</small></div><span className={entry.supported?"extract-ready":"extract-unsupported"}>{entry.supported?"TEXT EXTRACTABLE":"PREVIEW ONLY"}</span></div>{entry.supported?<pre>{entry.text||"No text content found."}</pre>:<div className="preview-empty"><FileText size={25}/><strong>This file is indexed, but text extraction is not available for this format yet.</strong><small>Archive path and file metadata are available.</small></div>}<div className="preview-actions"><button className="secondary-button" onClick={()=>{const blob=new Blob([entry.text||""],{type:"text/plain"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=entry.path.split("/").pop()||"extracted.txt";a.click();URL.revokeObjectURL(url)}} disabled={!entry.supported||!entry.text}>Download extracted text</button><button className="primary-button" onClick={()=>extractArchiveEntry(entry)} disabled={!entry.supported||!entry.text||entry.text.startsWith("[Skipped:")}>Add to My Notes <ArrowRight size={14}/></button></div></>:<div className="preview-empty">Choose a file to preview its extracted content.</div>})()}</div></div></section>}<h3 className="library-heading">Your documents · {notes.length}</h3><div className="library-list">{notes.map(n=><button key={n.id} className="library-row" onClick={()=>openNote(n)}><FileText/><span><strong>{n.title}</strong><small>{n.subject} · {n.updated}</small></span><ArrowRight size={16}/></button>)}</div></section>:<><section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> YOUR PERSONAL KNOWLEDGE SPACE</div><h1>{active==="Overview"?"Good morning, Rohith":active}<span className="wave">✦</span></h1><p>Your ideas, notes and learning — all in one intelligent workspace.</p></div><button className="primary-button" onClick={createNote}><Plus size={17}/> New note</button></section>
  {active==="Overview"&&<section className="hero-card"><div className="hero-copy"><div className="hero-label"><Sparkles size={14}/> MEET YOUR AI STUDY PARTNER</div><h2>Think clearly.<br/><em>Learn deeply.</em></h2><p>Turn scattered information into structured knowledge. Ask questions, understand complex topics and make every study session count.</p><button className="hero-button" onClick={()=>setActive("AI Study Room")}>Open AI Study Room <ArrowRight size={16}/></button></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orb-core"><BrainCircuit size={54}/></div><div className="float-chip chip-top"><Sparkles size={14}/> AI insights</div><div className="float-chip chip-bottom"><Check size={14}/> Knowledge organized</div><div className="tiny-star star-a">✳</div><div className="tiny-star star-b">✦</div></div></section>}
  <section className="stats-grid"><div className="stat-card"><div className="stat-icon purple-icon"><FileText size={18}/></div><div><span>Total notes</span><strong>{notes.length.toString().padStart(2,"0")}</strong><small>Saved in this browser</small></div></div><div className="stat-card"><div className="stat-icon blue-icon"><BookOpen size={18}/></div><div><span>Study collections</span><strong>03</strong><small>Across your subjects</small></div></div><div className="stat-card"><div className="stat-icon orange-icon"><Activity size={18}/></div><div><span>Learning streak</span><strong>—</strong><small>Tracking coming soon</small></div></div><div className="stat-card"><div className="stat-icon green-icon"><Lightbulb size={18}/></div><div><span>AI summaries</span><strong>—</strong><small>AI connection pending</small></div></div></section>
  <section className="section-heading"><div><h3>{active==="My Notes"?"All notes":"Continue learning"}</h3><p>{active==="My Notes"?"Your saved notes and imported material.":"Pick up right where you left off."}</p></div><button className="text-button" onClick={()=>setActive("My Notes")}>View all <ArrowRight size={15}/></button></section>
  <section className="notes-grid">{filtered.length?filtered.map(n=><article className="note-card" key={n.id} onClick={()=>openNote(n)}><div className="note-card-top"><div className={`note-icon ${n.color}`}><FileText size={18}/></div><button className="icon-button" onClick={e=>{e.stopPropagation();openNote(n)}} aria-label="Open note"><MoreHorizontal size={18}/></button></div><div className="note-subject">{n.subject}</div><h4>{n.title}</h4><p>{n.excerpt}</p><div className="note-footer"><span>{n.updated}</span><button aria-label="Edit note"><ArrowRight size={16}/></button></div></article>):<div className="empty-state"><Search size={22}/><strong>No notes found</strong><span>Try another search term.</span></div>}<button className="add-note-card" onClick={createNote}><span><Plus size={20}/></span><strong>Create a new note</strong><small>Capture a thought or start studying</small></button></section>
  <section className="bottom-grid"><div className="tip-card"><div className="tip-icon"><Lightbulb size={18}/></div><div><span className="tip-label">A LITTLE STUDY TIP</span><h4>Small sessions. Big progress.</h4><p>Try the 25-minute focus method: study one concept, take a short break, then explain what you learned in your own words.</p></div><Star className="tip-star" size={17}/></div><div className="quick-card"><h3>Quick actions</h3><button onClick={createNote}><FilePlus2 size={17}/><span>Write a new note</span><ArrowRight size={15}/></button><button onClick={()=>setActive("Library")}><UploadCloud size={17}/><span>Import a document</span><ArrowRight size={15}/></button><button onClick={()=>setActive("AI Study Room")}><MessageSquareText size={17}/><span>Ask AI a question</span><ArrowRight size={15}/></button></div></section>
  </>}
  <footer className="footer"><span>ARC AI <span className="footer-dot">·</span> Your knowledge, connected.</span><span>Made for curious minds <Sparkles size={12}/></span></footer></div>
 </main>{toast&&<div className="toast"><Check size={15}/>{toast}</div>}
 </div>
}
export default App;
