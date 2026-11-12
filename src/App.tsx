import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import JSZip from "jszip";
import {
  Activity, AlignCenter, AlignLeft, AlignRight, ArrowLeft, ArrowRight, Bold, Bell, BookOpen, BrainCircuit, Check, CheckSquare, ClipboardList, ExternalLink, FileSpreadsheet, FileImage, FileAudio, FileVideo, Moon, Sun, Send,
  ChevronDown, Download, FilePlus2, FileText, FolderOpen, GraduationCap,
  Highlighter, Italic, LayoutDashboard, Lightbulb, List, ListOrdered, Menu, MessageSquareText, MoreHorizontal,
  Plus, Search, Settings2, Sparkles, Star, Strikethrough, Trash2, Underline, UploadCloud, X, Pencil, Eraser
} from "lucide-react";

import { createWorker } from "tesseract.js";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import * as mammoth from "mammoth";
import * as XLSX from "xlsx";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ArchiveEntry = { path:string; size:number; kind:string; text:string; supported:boolean };
type Note = { id:number; title:string; subject:string; updated:string; color:string; excerpt:string; body:string };
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
 const [drawing,setDrawing]=useState(false);
 const [drawMode,setDrawMode]=useState<"pen"|"line"|"rectangle"|"circle">("pen");
 const [drawColor,setDrawColor]=useState("#d5d7e0");
 const [drawWidth,setDrawWidth]=useState(3);
 const [recognizing,setRecognizing]=useState(false);
 const [theme,setTheme]=useState<"dark"|"light">(()=>localStorage.getItem("arc-theme")==="light"?"light":"dark");
 const [firebaseKey,setFirebaseKey]=useState(()=>localStorage.getItem("arc-firebase-api-key")||"");
 const [aiMessages,setAiMessages]=useState<{role:"user"|"assistant";content:string}[]>([]);
 const [aiInput,setAiInput]=useState("");
 const [aiBusy,setAiBusy]=useState(false);
 const [aiError,setAiError]=useState("");
 const [aiResult,setAiResult]=useState("");
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
  else{for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);}ctx.stroke();
 }
 function pointerPoint(e:React.PointerEvent<HTMLCanvasElement>){const r=e.currentTarget.getBoundingClientRect();return{x:(e.clientX-r.left)*e.currentTarget.width/r.width,y:(e.clientY-r.top)*e.currentTarget.height/r.height};}
 function startDrawing(e:React.PointerEvent<HTMLCanvasElement>){e.currentTarget.setPointerCapture(e.pointerId);const p=pointerPoint(e);drawPointsRef.current=[p];setDrawing(true);drawCanvasStroke([p],drawMode,drawColor,drawWidth);}
 function moveDrawing(e:React.PointerEvent<HTMLCanvasElement>){if(!drawing)return;const p=pointerPoint(e);drawPointsRef.current.push(p);if(drawMode==="pen"){const pts=drawPointsRef.current;drawCanvasStroke(pts.slice(-2),"pen",drawColor,drawWidth);}else{const canvas=drawCanvasRef.current;const ctx=canvas?.getContext("2d");if(canvas&&ctx)ctx.clearRect(0,0,canvas.width,canvas.height);drawCanvasStroke(drawPointsRef.current,drawMode,drawColor,drawWidth);}}
 function finishDrawing(){if(!drawing)return;setDrawing(false);const pts=drawPointsRef.current;if(pts.length<2)return;const first=pts[0],last=pts[pts.length-1];const distance=Math.hypot(last.x-first.x,last.y-first.y);const path=pts.reduce((sum,p,i)=>i?sum+Math.hypot(p.x-pts[i-1].x,p.y-pts[i-1].y):0,0);const ratio=distance/Math.max(path,1);const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);const w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);const closed=distance<Math.max(w,h)*.22&&path>25;let mode="pen";let corrected=pts;
  if(drawMode==="pen"&&ratio>.94&&distance>25){mode="line";corrected=[first,last];}
  else if(drawMode==="pen"&&closed&&w>18&&h>18){mode=Math.abs(w-h)/Math.max(w,h)<.18?"circle":"rectangle";corrected=[{x:Math.min(...xs),y:Math.min(...ys)},{x:Math.max(...xs),y:Math.max(...ys)}];}
  const canvas=drawCanvasRef.current;if(canvas){const ctx=canvas.getContext("2d");if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height);}drawCanvasStroke(corrected,mode,drawColor,drawWidth);notify(mode==="pen"?"Doodle added":"Recognized and corrected "+mode);
 }

 function insertDrawingIntoNote(){
  const canvas=drawCanvasRef.current;if(!canvas||!editorRef.current)return;
  const image=canvas.toDataURL("image/png");editorRef.current.focus();
  document.execCommand("insertHTML",false,'<p><img src="'+image+'" alt="Hand-drawn diagram" style="max-width:100%;height:auto;border-radius:8px" /></p>');
  syncEditor();notify("Drawing inserted into your note");
 }
 function clearDrawing(){const c=drawCanvasRef.current;if(c){const ctx=c.getContext("2d");if(ctx)ctx.clearRect(0,0,c.width,c.height);}}
 async function recognizeDrawingText(){const canvas=drawCanvasRef.current;if(!canvas)return;setRecognizing(true);try{const worker=await createWorker("eng");const result=await worker.recognize(canvas);await worker.terminate();const text=result.data.text.trim();if(!text){notify("No readable text detected. Try clearer handwriting.");return;}if(editorRef.current){editorRef.current.focus();document.execCommand("insertText",false,"\n"+text+"\n");syncEditor();}notify("Handwriting converted to editable text");}catch{notify("Text recognition failed. Check your connection and try again.");}finally{setRecognizing(false);}}

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
 async function callArcAI(mode:"chat"|"summary"|"cards"|"kit",messages:{role:"user"|"assistant";content:string}[]=[]){
  setAiBusy(true);setAiError("");setAiResult("");
  try{
   const idToken=await getFirebaseIdToken();
   const context=notes.map(n=>"TITLE: "+n.title+"\nSUBJECT: "+n.subject+"\n"+n.body.replace(/<[^>]*>/g," ")).join("\n\n").slice(0,14000);
   const response=await fetch("https://oremmzzhmyhqqftexcor.supabase.co/functions/v1/arc",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+idToken},body:JSON.stringify({action:"ai",mode,context,messages})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"AI request failed ("+response.status+").");
   const result=String(data.text||"").trim();
   if(!result)throw new Error("The AI returned an empty response. Please try again.");
   setAiResult(result);
   if(mode==="chat")setAiMessages(old=>[...old,{role:"assistant",content:result}]);
   return result;
  }catch(error){const message=error instanceof Error?error.message:"AI connection failed.";setAiError(message);return "";}
  finally{setAiBusy(false);}
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
  {title:"Formal business letter",category:"Business",body:"[Your name]\n[Your address]\n[City, PIN]\n[Email] · [Phone]\n\n[Date]\n\n[Recipient name]\n[Designation]\n[Organization]\n[Address]\n\nSubject: [Clear subject]\n\nDear [Recipient name],\n\nI am writing to [state your purpose clearly]. [Provide the key details, context and any relevant dates.]\n\nI would appreciate your consideration of this request. Please let me know if you need any further information.\n\nYours sincerely,\n[Your name]"},
  {title:"Job application cover letter",category:"Career",body:"[Your name] · [Phone] · [Email] · [LinkedIn]\n[Date]\n\nHiring Manager\n[Company name]\n\nSubject: Application for [Job title]\n\nDear Hiring Manager,\n\nI am applying for the [Job title] position at [Company]. My experience with [relevant skills] and work on [relevant project] have prepared me to contribute to your team.\n\nIn [project or internship], I [specific achievement with evidence]. I am particularly interested in [specific reason related to the company or role].\n\nThank you for considering my application. I would welcome the opportunity to discuss my fit for this role.\n\nSincerely,\n[Your name]"},
  {title:"Resignation letter",category:"Career",body:"[Your name]\n[Date]\n\n[Manager name]\n[Company]\n\nSubject: Formal resignation\n\nDear [Manager name],\n\nPlease accept this letter as formal notice of my resignation from my position as [Role] at [Company], effective [Last working day].\n\nThank you for the opportunities and support during my time here. I will do my best to ensure a smooth handover of my responsibilities.\n\nSincerely,\n[Your name]"},
  {title:"Leave request",category:"Work / Education",body:"[Your name]\n[Date]\n\nTo: [Manager / Faculty name]\nSubject: Request for leave from [Start date] to [End date]\n\nDear [Name],\n\nI request leave for [number] day(s), from [start date] through [end date], due to [brief reason]. I will complete or hand over any pending responsibilities before my leave.\n\nKindly approve my request.\n\nRegards,\n[Your name]"},
  {title:"Recommendation letter",category:"Education / Career",body:"[Date]\n\nTo Whom It May Concern,\n\nI am pleased to recommend [Candidate name] for [role / program]. I have known [Candidate] in my capacity as [relationship] for [duration].\n\nDuring this time, [Candidate] demonstrated [specific strengths], particularly through [specific example]. I believe these qualities make [Candidate] a strong fit for [opportunity].\n\nPlease contact me if further information is required.\n\nSincerely,\n[Recommender name]\n[Title / Organization]"},
  {title:"Complaint / service request",category:"Customer service",body:"[Your name and contact details]\n[Date]\n\nTo: [Company / Department]\n\nSubject: Complaint regarding [product / service / reference number]\n\nDear Customer Support Team,\n\nI am writing to report an issue with [brief description]. The issue occurred on [date] and the relevant reference is [order / ticket number].\n\nI request [specific resolution]. Please confirm the next steps and expected timeline. I have included [supporting documents] for reference.\n\nRegards,\n[Your name]"}
 ];
 function useLetterTemplate(template:{title:string;category:string;body:string}){
  const id=Date.now()+Math.random();const n:Note={id,title:template.title,subject:"Letter template · "+template.category,updated:"Just now",color:"violet",excerpt:"Editable letter template — replace the bracketed placeholders.",body:template.body.replace(/\n/g,"<br>")};
  setNotes(old=>[n,...old]);setSelected(id);setActive("Editor");notify("Template added to My Notes");
 }
 async function importTemplateFromUrl(){
  const url=templateUrl.trim();if(!/^https?:\/\//i.test(url)){notify("Enter a valid public http or https URL");return}
  setTemplateBusy(true);
  try{
   const response=await fetch(url);if(!response.ok)throw new Error("The source returned "+response.status);
   const type=response.headers.get("content-type")||"";
   const raw=await response.text();
   const doc=new DOMParser().parseFromString(raw,type.includes("html")?"text/html":"text/plain");
   const body=type.includes("html")?(doc.body.innerText||doc.body.textContent||""):raw;
   const clean=body.trim().slice(0,30000);if(!clean)throw new Error("No readable text was found at that URL.");
   const id=Date.now()+Math.random();const n:Note={id,title:(doc.title||"Imported letter template").slice(0,100),subject:"Imported web template",updated:"Just now",color:"blue",excerpt:clean.slice(0,110),body:clean};
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
 function saveNote(){if(!current)return;syncEditor();const body=editorRef.current?cleanEditorHTML(editorRef.current.innerHTML):draft;const title=titleDraft.trim()||"Untitled note";setNotes(old=>old.map(n=>n.id===current.id?{...n,title,body,excerpt:body.replace(/[#*\\n]/g," ").slice(0,110),updated:"Just now"}:n));notify("Note saved on this device")}
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
    setNotes(old=>[{id,title:file.name.replace(/\.[^.]+$/,""),subject:result.extractable?"Imported · "+result.kind:"Library reference · "+result.kind,updated:"Just now",color:"blue",excerpt:(result.text||"No text extracted").slice(0,110),body:result.text},...old]);
    notify(result.extractable?"Imported "+file.name:"Added "+file.name+" as a library reference");
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
  <div className="brand-row"><div className="brand-mark"><Sparkles size={19}/></div><span className="brand-name">arc<span>.</span></span><button className="icon-button mobile-close" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
  <button className="workspace-switch"><div className="workspace-avatar">R</div><span><strong>My workspace</strong><small>Personal plan · Local mode</small></span><ChevronDown size={15}/></button>
  <button className="new-note-button" onClick={createNote}><Plus size={17}/> Create new note <span>⌘ N</span></button>
  <div className="nav-caption">WORKSPACE</div><nav className="main-nav">{navItems.map(({label,icon:Icon})=><button key={label} className={`nav-item ${active===label?"active":""}`} onClick={()=>{setActive(label);setSelected(null);setMobileNav(false)}}><Icon size={17}/><span>{label}</span>{label==="AI Study Room"&&<span className="nav-new">BETA</span>}</button>)}</nav>
  <div className="nav-caption collections-caption">YOUR COLLECTIONS <button aria-label="Add collection"><Plus size={14}/></button></div>
  <button className="collection-item"><span className="collection-dot dot-purple"/> Semester 5</button><button className="collection-item"><span className="collection-dot dot-blue"/> Exam preparation</button><button className="collection-item"><span className="collection-dot dot-orange"/> Project research</button>
  <div className="sidebar-bottom"><div className="storage-card"><div className="storage-heading"><span>Saved on this device</span><span>LOCAL</span></div><div className="storage-track"><i/></div><small>Your notes stay in this browser</small></div><button className={`nav-item ${active==="Settings"?"active":""}`} onClick={()=>{setActive("Settings");setSelected(null);setMobileNav(false)}}><Settings2 size={17}/><span>Settings</span></button><div className="profile-row"><div className="profile-avatar">R</div><span><strong>Rohith</strong><small>Personal workspace</small></span><MoreHorizontal size={18}/></div></div>
 </aside>
 {mobileNav&&<button className="mobile-scrim" onClick={()=>setMobileNav(false)} aria-label="Close menu"/>}
 <main className="main-area">
  <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={()=>setMobileNav(true)}><Menu size={19}/></button><span>Workspace</span><span className="crumb-slash">/</span><strong>{active}</strong></div><div className="topbar-actions"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search notes…"/><kbd>⌘ K</kbd></label><button className="icon-button" onClick={()=>setTheme(theme==="dark"?"light":"dark")} aria-label={theme==="dark"?"Switch to light theme":"Switch to dark theme"} title={theme==="dark"?"Light theme":"Dark theme"}>{theme==="dark"?<Sun size={18}/>:<Moon size={18}/>}</button><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18}/></button><div className="top-avatar">R</div></div></header>
  <div className="page-content">
  {active==="Editor"&&current?<><div className="editor-toolbar"><button className="text-button" onClick={()=>{setSelected(null);setActive("My Notes")}}><ArrowLeft size={15}/> All notes</button><div className="editor-actions"><span className="save-status"><Check size={13}/> Saved locally when you click Save</span><button className="secondary-button" onClick={exportNote}><Download size={15}/> Export .md</button><button className="secondary-button danger-button" onClick={deleteNote}><Trash2 size={15}/></button><button className="primary-button" onClick={saveNote}>Save note <Check size={15}/></button></div></div><div className="editor-wrap"><input className="editor-title" value={titleDraft} onChange={e=>setTitleDraft(e.target.value)} placeholder="Untitled note"/><div className="editor-meta"><span>{current.subject}</span><span>Rich text editor · Save to keep changes</span></div><section className="doodle-panel"><div className="doodle-head"><div><strong><Pencil size={15}/> Smart doodle</strong><small>Draw freehand — ARC straightens lines and recognizes circles and rectangles.</small></div><div className="doodle-head-actions"><button className="secondary-button" onClick={insertDrawingIntoNote}>Insert into note</button><button className="secondary-button" onClick={clearDrawing}><Eraser size={14}/> Clear canvas</button></div></div><div className="doodle-tools"><select aria-label="Drawing tool" value={drawMode} onChange={e=>setDrawMode(e.target.value as "pen"|"line"|"rectangle"|"circle")}><option value="pen">Auto-detect</option><option value="line">Straight line</option><option value="rectangle">Rectangle</option><option value="circle">Ellipse</option></select><label>Ink <input type="color" value={drawColor} onChange={e=>setDrawColor(e.target.value)}/></label><label>Stroke <input type="range" min="1" max="10" value={drawWidth} onChange={e=>setDrawWidth(Number(e.target.value))}/></label><button className="primary-button" onClick={recognizeDrawingText} disabled={recognizing}>{recognizing?"Reading handwriting…":"Convert handwriting to text"}</button></div><canvas ref={drawCanvasRef} className="doodle-canvas" width={1000} height={330} onPointerDown={startDrawing} onPointerMove={moveDrawing} onPointerUp={finishDrawing} onPointerCancel={finishDrawing}/><small className="doodle-hint">Tip: draw one shape at a time. OCR works best with clear, separated English handwriting.</small></section><div className="rich-toolbar" role="toolbar" aria-label="Note formatting toolbar"><div className="tool-group"><button type="button" title="Bold" onMouseDown={e=>e.preventDefault()} onClick={()=>format("bold")}><Bold size={16}/></button><button type="button" title="Italic" onMouseDown={e=>e.preventDefault()} onClick={()=>format("italic")}><Italic size={16}/></button><button type="button" title="Underline" onMouseDown={e=>e.preventDefault()} onClick={()=>format("underline")}><Underline size={16}/></button><button type="button" title="Strikethrough" onMouseDown={e=>e.preventDefault()} onClick={()=>format("strikeThrough")}><Strikethrough size={16}/></button></div><div className="tool-group"><select aria-label="Font family" defaultValue="Arial" onChange={e=>format("fontName",e.target.value)}><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Courier New">Courier New</option><option value="Trebuchet MS">Trebuchet</option><option value="Times New Roman">Times New Roman</option></select><select aria-label="Text size" defaultValue="3" onChange={e=>format("fontSize",e.target.value)}><option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">XL</option><option value="6">XXL</option></select></div><div className="tool-group color-tool"><label title="Text color">A<input aria-label="Text color" type="color" defaultValue="#d5d7e0" onChange={e=>format("foreColor",e.target.value)}/></label><label title="Highlight color"><Highlighter size={15}/><input aria-label="Highlight color" type="color" defaultValue="#6550a4" onChange={e=>format("hiliteColor",e.target.value)}/></label></div><div className="tool-group"><button type="button" title="Align left" onMouseDown={e=>e.preventDefault()} onClick={()=>format("justifyLeft")}><AlignLeft size={16}/></button><button type="button" title="Align center" onMouseDown={e=>e.preventDefault()} onClick={()=>format("justifyCenter")}><AlignCenter size={16}/></button><button type="button" title="Align right" onMouseDown={e=>e.preventDefault()} onClick={()=>format("justifyRight")}><AlignRight size={16}/></button></div><div className="tool-group"><button type="button" title="Bulleted list" onMouseDown={e=>e.preventDefault()} onClick={()=>format("insertUnorderedList")}><List size={16}/></button><button type="button" title="Numbered list" onMouseDown={e=>e.preventDefault()} onClick={()=>format("insertOrderedList")}><ListOrdered size={16}/></button><button type="button" title="Insert task checklist" onMouseDown={e=>e.preventDefault()} onClick={addChecklist}><CheckSquare size={16}/></button><button type="button" title="Block quote" onMouseDown={e=>e.preventDefault()} onClick={()=>format("formatBlock","blockquote")}>❞</button></div><div className="tool-group shape-tools"><span>Shapes</span><button type="button" title="Insert circle" onMouseDown={e=>e.preventDefault()} onClick={()=>insertShape("circle")}>○</button><button type="button" title="Insert square" onMouseDown={e=>e.preventDefault()} onClick={()=>insertShape("square")}>□</button><button type="button" title="Insert triangle" onMouseDown={e=>e.preventDefault()} onClick={()=>insertShape("triangle")}>△</button></div></div><div ref={editorRef} className="note-editor rich-editor" contentEditable suppressContentEditableWarning role="textbox" aria-label="Note content" aria-multiline="true" data-placeholder="Start writing your notes here…" onInput={syncEditor} onBlur={syncEditor}/></div></>:active==="AI Study Room"?<section className="module-page"><div className="eyebrow"><span className="live-dot"/> SECURE AI STUDY COPILOT</div><h1>AI Study Room</h1><p>Ask questions, summarize your notes and create revision material grounded in your library.</p><div className="ai-action-row"><button className="primary-button" onClick={()=>callArcAI("summary")} disabled={aiBusy}><Sparkles size={15}/> Summarize all notes</button><button className="secondary-button" onClick={()=>callArcAI("cards")} disabled={aiBusy}><GraduationCap size={15}/> Generate flashcards</button><button className="secondary-button" onClick={()=>callArcAI("kit")} disabled={aiBusy}><ClipboardList size={15}/> Build study kit</button></div>{!firebaseKey&&<div className="ai-setup-card"><div className="ai-setup-icon"><BrainCircuit size={25}/></div><div><h3>Connect your Firebase project</h3><p>Add the Firebase Web API key in Settings and enable Anonymous sign-in. AI calls are routed through the secured ARC Edge Function; no Groq key is exposed in the browser.</p><button className="secondary-button" onClick={()=>setActive("Settings")}>Open AI settings <ArrowRight size={14}/></button></div></div>}{aiError&&<div className="archive-error">{aiError}</div>}{aiBusy&&<div className="archive-status"><span className="spinner"/> ARC AI is reading your notes and preparing a response…</div>}{aiResult&&<div className="ai-result-card"><div className="section-heading"><div><h3>ARC AI response</h3><p>Generated from your saved notes and the current prompt.</p></div><button className="text-button" onClick={()=>{navigator.clipboard?.writeText(aiResult);notify("AI response copied")}}>Copy response</button></div><pre>{aiResult}</pre></div>}<div className="ai-chat-card"><div className="ai-chat-heading"><div className="ai-setup-icon"><BrainCircuit size={22}/></div><div><h3>Ask ARC AI</h3><p>Beginner-friendly explanations · Note-aware answers</p></div></div><div className="ai-messages">{aiMessages.length?aiMessages.map((m,i)=><div key={i} className={"ai-message "+m.role}><strong>{m.role==="user"?"You":"ARC AI"}</strong><p>{m.content}</p></div>):<div className="ai-chat-empty"><Sparkles size={22}/><strong>What would you like to understand?</strong><span>Try: “Explain compiler lexical analysis in simple steps.”</span></div>}</div><form className="ai-compose" onSubmit={e=>{e.preventDefault();void sendAIMessage()}}><input value={aiInput} onChange={e=>setAiInput(e.target.value)} placeholder="Ask a question about your notes…" disabled={aiBusy}/><button className="primary-button" type="submit" disabled={aiBusy||!aiInput.trim()}><Send size={16}/> Send</button></form></div></section>:active==="Flashcards"?<section className="module-page"><div className="eyebrow"><span className="live-dot"/> ACTIVE RECALL</div><h1>Flashcards</h1><p>Generate revision cards from your saved study material.</p><button className="primary-button" onClick={()=>callArcAI("cards")} disabled={aiBusy}><Sparkles size={15}/> Generate 8 flashcards with AI</button>{aiError&&<div className="archive-error">{aiError}</div>}{aiBusy&&<div className="archive-status"><span className="spinner"/> Generating flashcards…</div>}{aiResult&&<div className="ai-result-card"><h3>Generated flashcards</h3><pre>{aiResult}</pre></div>}<div className="empty-module"><GraduationCap size={30}/><h3>Study from your own notes</h3><p>AI-generated cards appear here after the AI service is connected and your notes are available.</p><button className="secondary-button" onClick={()=>setActive("Settings")}>Configure AI <ArrowRight size={14}/></button></div></section>:active==="Letter Templates"?<section className="module-page"><div className="eyebrow"><span className="live-dot"/> DOCUMENT STARTERS</div><h1>Letter templates</h1><p>Start with an editable ARC template or bring in a public template you are allowed to reuse.</p><div className="template-grid">{letterTemplates.map((t,i)=><article className="template-card" key={t.title}><div className="template-card-top"><span>{t.category}</span><FileText size={19}/></div><h3>{t.title}</h3><p>Editable starter · Replace bracketed fields with your details.</p><button className="primary-button" onClick={()=>useLetterTemplate(t)}>Use this template <ArrowRight size={14}/></button></article>)}</div><div className="web-template-card"><h3>Import a public template from the web</h3><p>Paste a direct public page URL. Pages that block browser access can still be opened from the source links below and copied into ARC.</p><div className="template-url-row"><input value={templateUrl} onChange={e=>setTemplateUrl(e.target.value)} placeholder="https://example.com/public-letter-template"/><button className="primary-button" onClick={importTemplateFromUrl} disabled={templateBusy||!templateUrl.trim()}>{templateBusy?"Importing…":"Import URL"}</button></div><div className="template-source-links"><a href="https://word.cloud.microsoft/create/en/letters-templates/" target="_blank" rel="noreferrer">Microsoft Word templates <ExternalLink size={13}/></a><a href="https://www.canva.com/letters/templates/business/" target="_blank" rel="noreferrer">Canva letter templates <ExternalLink size={13}/></a><a href="https://www.vertex42.com/WordTemplates/letters.html" target="_blank" rel="noreferrer">Vertex42 sample letters <ExternalLink size={13}/></a></div></div></section>:active==="Settings"?<section className="module-page"><div className="eyebrow"><span className="live-dot"/> WORKSPACE PREFERENCES</div><h1>Settings</h1><p>Manage appearance and connect your AI provider.</p><div className="settings-card"><div><h3>Appearance</h3><p>Choose the workspace colour scheme. Your choice is saved in this browser.</p></div><div className="theme-choice"><button className={theme==="dark"?"selected":""} onClick={()=>setTheme("dark")}><Moon size={18}/> Dark</button><button className={theme==="light"?"selected":""} onClick={()=>setTheme("light")}><Sun size={18}/> Light</button></div></div><div className="settings-card ai-settings"><div><h3>Firebase connection for ARC AI</h3><p>Enter the Firebase Web API key from Project settings → General → Your apps. This is a public client identifier, not a server secret. Enable Authentication → Sign-in method → Anonymous.</p></div><label>Firebase Web API key<input type="password" autoComplete="off" value={firebaseKey} onChange={e=>setFirebaseKey(e.target.value)} placeholder="AIza…"/></label><div className="settings-actions"><button className="primary-button" onClick={()=>{localStorage.setItem("arc-firebase-api-key",firebaseKey.trim());sessionStorage.removeItem("arc-firebase-id-token");sessionStorage.removeItem("arc-firebase-token-expiry");notify("Firebase settings saved on this device")}}>Save connection</button><button className="secondary-button" onClick={()=>callArcAI("summary")} disabled={aiBusy||!firebaseKey.trim()}>Test AI connection</button></div>{aiError&&<div className="archive-error">{aiError}</div>}{aiResult&&<div className="integration-tag">AI connection responded successfully</div>}</div><div className="settings-card"><div><h3>Data storage</h3><p>Notes are currently saved in this browser only. Cloud sync and cross-device backups are not enabled in this build.</p></div><span className="integration-tag">Local storage</span></div></section>:active==="Library"?<section className="module-page"><div className="eyebrow"><span className="live-dot"/> DOCUMENT LIBRARY</div><div className="module-title-row"><div><h1>Library</h1><p>Bring your study material into ARC AI.</p></div><button className="primary-button" onClick={()=>fileRef.current?.click()}><UploadCloud size={16}/> Import files</button></div><input ref={fileRef} type="file" multiple accept="*/*" hidden onChange={importFiles}/><div className="import-grid"><button className="upload-panel" onClick={()=>fileRef.current?.click()}><UploadCloud size={27}/><h3>Import individual files</h3><p>PDF · DOCX · XLSX · PPTX · TXT · CSV · Images · EPUB · More</p><small>Files are converted into editable ARC notes.</small></button><label className="upload-panel zip-upload"><input type="file" accept=".zip,application/zip" hidden onChange={importZip}/><div className="zip-icon">ZIP</div><h3>Open a ZIP archive</h3><p>Upload a ZIP to inspect its folders and files.</p><small>Up to 100 MB · Up to 1,500 files</small></label></div>{archiveBusy&&<div className="archive-status"><span className="spinner"/> Reading archive and building file index…</div>}{archiveError&&<div className="archive-error">{archiveError}</div>}{archive.length>0&&<section className="archive-browser"><div className="archive-heading"><div><span className="archive-kicker">ARCHIVE EXPLORER</span><h3>{archiveName}</h3><p>{archive.length} files indexed · {archive.filter(x=>x.supported).length} extractable text documents</p></div><button className="primary-button" onClick={extractAllSupported}>Extract supported files <ArrowRight size={15}/></button></div><div className="archive-controls"><label className="archive-search"><Search size={15}/><input value={archiveFilter} onChange={e=>setArchiveFilter(e.target.value)} placeholder="Filter archive files…"/></label><span>{archive.filter(x=>x.path.toLowerCase().includes(archiveFilter.toLowerCase())).length} shown</span></div><div className="archive-layout"><div className="archive-tree">{archive.filter(x=>x.path.toLowerCase().includes(archiveFilter.toLowerCase())).map(entry=><button key={entry.path} className={`archive-file ${archiveSelected===entry.path?"selected":""}`} onClick={()=>setArchiveSelected(entry.path)}><FileText size={15}/><span>{entry.path}</span><small>{entry.kind}</small></button>)}</div><div className="archive-preview">{(()=>{const entry=archive.find(x=>x.path===archiveSelected);return entry?<><div className="preview-file-head"><div><strong>{entry.path.split("/").pop()}</strong><small>{entry.path} · {entry.size.toLocaleString()} bytes</small></div><span className={entry.supported?"extract-ready":"extract-unsupported"}>{entry.supported?"TEXT EXTRACTABLE":"PREVIEW ONLY"}</span></div>{entry.supported?<pre>{entry.text||"No text content found."}</pre>:<div className="preview-empty"><FileText size={25}/><strong>This file is indexed, but text extraction is not available for this format yet.</strong><small>Archive path and file metadata are available.</small></div>}<div className="preview-actions"><button className="secondary-button" onClick={()=>{const blob=new Blob([entry.text||""],{type:"text/plain"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=entry.path.split("/").pop()||"extracted.txt";a.click();URL.revokeObjectURL(url)}} disabled={!entry.supported||!entry.text}>Download extracted text</button><button className="primary-button" onClick={()=>extractArchiveEntry(entry)} disabled={!entry.supported||!entry.text||entry.text.startsWith("[Skipped:")}>Add to My Notes <ArrowRight size={14}/></button></div></>:<div className="preview-empty">Choose a file to preview its extracted content.</div>})()}</div></div></section>}<h3 className="library-heading">Your documents · {notes.length}</h3><div className="library-list">{notes.map(n=><button key={n.id} className="library-row" onClick={()=>openNote(n)}><FileText/><span><strong>{n.title}</strong><small>{n.subject} · {n.updated}</small></span><ArrowRight size={16}/></button>)}</div></section>:<><section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> YOUR PERSONAL KNOWLEDGE SPACE</div><h1>{active==="Overview"?"Good morning, Rohith":active}<span className="wave">✦</span></h1><p>Your ideas, notes and learning — all in one intelligent workspace.</p></div><button className="primary-button" onClick={createNote}><Plus size={17}/> New note</button></section>
  {active==="Overview"&&<section className="hero-card"><div className="hero-copy"><div className="hero-label"><Sparkles size={14}/> MEET YOUR AI STUDY PARTNER</div><h2>Think clearly.<br/><em>Learn deeply.</em></h2><p>Turn scattered information into structured knowledge. Ask questions, understand complex topics and make every study session count.</p><button className="hero-button" onClick={()=>setActive("AI Study Room")}>Open AI Study Room <ArrowRight size={16}/></button></div><div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orb-core"><BrainCircuit size={54}/></div><div className="float-chip chip-top"><Sparkles size={14}/> AI insights</div><div className="float-chip chip-bottom"><Check size={14}/> Knowledge organized</div><div className="tiny-star star-a">✳</div><div className="tiny-star star-b">✦</div></div></section>}
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
