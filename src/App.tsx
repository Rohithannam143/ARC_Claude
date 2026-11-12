import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import JSZip from "jszip";
import {
  Activity, AlignCenter, AlignLeft, AlignRight, ArrowLeft, ArrowRight, Bold, Bell, BookOpen, BrainCircuit, Check,
  ChevronDown, Download, FilePlus2, FileText, FolderOpen, GraduationCap,
  Highlighter, Italic, LayoutDashboard, Lightbulb, List, ListOrdered, Menu, MessageSquareText, MoreHorizontal,
  Plus, Search, Settings2, Sparkles, Star, Strikethrough, Trash2, Underline, UploadCloud, X
} from "lucide-react";

type ArchiveEntry = { path:string; size:number; kind:string; text:string; supported:boolean };
type Note = { id:number; title:string; subject:string; updated:string; color:string; excerpt:string; body:string };
const starterNotes:Note[]=[
 {id:1,title:"Introduction to Artificial Intelligence",subject:"Artificial Intelligence",updated:"Today",color:"violet",excerpt:"Core concepts, intelligent agents, problem-solving and search strategies.",body:"# Introduction to Artificial Intelligence\n\nArtificial Intelligence (AI) is the field of building systems that can perform tasks that normally require human intelligence.\n\n## Key topics\n- Intelligent agents\n- Problem-solving agents\n- Search strategies\n- Heuristic functions\n\nAdd your own class notes here."},
 {id:2,title:"Compiler Design — Lexical Analysis",subject:"Compiler Design",updated:"Yesterday",color:"blue",excerpt:"Tokens, patterns, lexemes and the role of a lexical analyser.",body:"# Lexical Analysis\n\nA lexical analyser is the first phase of a compiler. It reads source code and groups characters into tokens.\n\n## Important terms\n- Token: a category such as identifier or keyword\n- Lexeme: the actual character sequence\n- Pattern: the rule describing a token"},
 {id:3,title:"Cloud Computing Fundamentals",subject:"Cloud Computing",updated:"Nov 10",color:"orange",excerpt:"Service models, deployment models, virtualization and cloud architecture.",body:"# Cloud Computing Fundamentals\n\nCloud computing provides on-demand access to computing resources over a network.\n\n## Service models\n- IaaS\n- PaaS\n- SaaS"}
];
const navItems=[{label:"Overview",icon:LayoutDashboard},{label:"My Notes",icon:FileText},{label:"Library",icon:FolderOpen},{label:"AI Study Room",icon:BrainCircuit},{label:"Flashcards",icon:GraduationCap}];

function cleanEditorHTML(input:string){
 const doc=new DOMParser().parseFromString(input,"text/html");
 const allowed=new Set(["P","DIV","BR","STRONG","B","EM","I","U","S","STRIKE","H1","H2","H3","H4","UL","OL","LI","BLOCKQUOTE","SPAN","FONT","HR"]);
 const walk=(node:Element)=>{
  Array.from(node.children).forEach(child=>{
   walk(child);
   if(!allowed.has(child.tagName)){child.replaceWith(...Array.from(child.childNodes));return;}
   Array.from(child.attributes).forEach(attr=>{
    if(attr.name==="face"||attr.name==="color"||attr.name==="size"){if(child.tagName==="FONT"&&/^(face|color|size)$/.test(attr.name))return;child.removeAttribute(attr.name);return;}\n    if(attr.name!=="style"){child.removeAttribute(attr.name);return;}
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
 useEffect(()=>{if(current){setDraft(current.body);setTitleDraft(current.title);if(editorRef.current)editorRef.current.innerHTML=initialEditorHTML(current.body)}},[selected]);
 const filtered=useMemo(()=>notes.filter(n=>(n.title+n.subject+n.excerpt+n.body).toLowerCase().includes(query.toLowerCase())),[notes,query]);
 function notify(s:string){setToast(s);window.setTimeout(()=>setToast(""),2600)}
 function openNote(n:Note){setSelected(n.id);setActive("Editor")}

 function syncEditor(){if(editorRef.current)setDraft(cleanEditorHTML(editorRef.current.innerHTML));}
 function format(command:string,value?:string){editorRef.current?.focus();document.execCommand(command,false,value);syncEditor();}
 function insertShape(shape:string){
  editorRef.current?.focus();
  const html=shape==="circle"?"<span style='display:inline-block;width:22px;height:22px;border:2px solid #a994ff;border-radius:50%;vertical-align:middle;margin:0 5px'></span>":shape==="square"?"<span style='display:inline-block;width:22px;height:22px;border:2px solid #a994ff;vertical-align:middle;margin:0 5px'></span>":"<span style='display:inline-block;color:#a994ff;font-size:26px;vertical-align:middle;margin:0 5px'>▲</span>";
  document.execCommand("insertHTML",false,html);syncEditor();
 }
 function saveNote(){if(!current)return;syncEditor();const body=editorRef.current?cleanEditorHTML(editorRef.current.innerHTML):draft;const title=titleDraft.trim()||"Untitled note";setNotes(old=>old.map(n=>n.id===current.id?{...n,title,body,excerpt:body.replace(/[#*\\n]/g," ").slice(0,110),updated:"Just now"}:n));notify("Note saved on this device")}
 function createNote(){const id=Date.now();const n:Note={id,title:"Untitled note",subject:"Unsorted",updated:"Just now",color:"violet",excerpt:"Start writing your ideas…",body:""};setNotes(old=>[n,...old]);setSelected(id);setActive("Editor")}
 async function importFiles(e:ChangeEvent<HTMLInputElement>){
  const files=Array.from(e.target.files||[]);
  for(const file of files){
   try{
    const text=await file.text();
    if(!/\\.(txt|md|markdown|csv|json|html|htm|xml|log)$/i.test(file.name)){notify(file.name+": unsupported file type");continue}
    const id=Date.now()+Math.random();
    setNotes(old=>[{id,title:file.name.replace(/\\.[^.]+$/,""),subject:"Imported document",updated:"Just now",color:"blue",excerpt:text.slice(0,110),body:text},...old]);
    notify("Imported "+file.name);
   }catch{notify("Could not read "+file.name)}
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
    const supported=["txt","md","markdown","csv","json","html","htm","xml","log","docx"].includes(ext);
    const size=(item as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize||0;
    let body="";
    if(supported){
     if(size>8*1024*1024){body="[Skipped: file exceeds 8 MB text extraction limit]"}
     else if(ext==="docx"){
      const doc=await JSZip.loadAsync(await item.async("uint8array"));
      const xml=await doc.file("word/document.xml")?.async("text");
       body=xml?xml.replace(/<w:tab\/>/g,"\t").replace(/<w:br\/>/g,"\n").replace(/<\/w:p>/g,"\n").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim():"Could not find document text in this DOCX.";
     }else body=await item.async("text");
    }
    entries.push({path,size,kind:ext.toUpperCase()||"FILE",text:body,supported});
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
  <div className="sidebar-bottom"><div className="storage-card"><div className="storage-heading"><span>Saved on this device</span><span>LOCAL</span></div><div className="storage-track"><i/></div><small>Your notes stay in this browser</small></div><button className="nav-item"><Settings2 size={17}/><span>Settings</span></button><div className="profile-row"><div className="profile-avatar">R</div><span><strong>Rohith</strong><small>Personal workspace</small></span><MoreHorizontal size={18}/></div></div>
 </aside>
 {mobileNav&&<button className="mobile-scrim" onClick={()=>setMobileNav(false)} aria-label="Close menu"/>}
 <main className="main-area">
  <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={()=>setMobileNav(true)}><Menu size={19}/></button><span>Workspace</span><span className="crumb-slash">/</span><strong>{active}</strong></div><div className="topbar-actions"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search notes…"/><kbd>⌘ K</kbd></label><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18}/></button><div className="top-avatar">R</div></div></header>
  <div className="page-content">
  {active==="Editor"&&current?<><div className="editor-toolbar"><button className="text-button" onClick={()=>{setSelected(null);setActive("My Notes")}}><ArrowLeft size={15}/> All notes</button><div className="editor-actions"><span className="save-status"><Check size={13}/> Saved locally when you click Save</span><button className="secondary-button" onClick={exportNote}><Download size={15}/> Export .md</button><button className="secondary-button danger-button" onClick={deleteNote}><Trash2 size={15}/></button><button className="primary-button" onClick={saveNote}>Save note <Check size={15}/></button></div></div><div className="editor-wrap"><input className="editor-title" value={titleDraft} onChange={e=>setTitleDraft(e.target.value)} placeholder="Untitled note"/><div className="editor-meta"><span>{current.subject}</span><span>Rich text editor · Save to keep changes</span></div><div className="rich-toolbar" role="toolbar" aria-label="Note formatting toolbar"><div className="tool-group"><button type="button" title="Bold" onMouseDown={e=>e.preventDefault()} onClick={()=>format("bold")}><Bold size={16}/></button><button type="button" title="Italic" onMouseDown={e=>e.preventDefault()} onClick={()=>format("italic")}><Italic size={16}/></button><button type="button" title="Underline" onMouseDown={e=>e.preventDefault()} onClick={()=>format("underline")}><Underline size={16}/></button><button type="button" title="Strikethrough" onMouseDown={e=>e.preventDefault()} onClick={()=>format("strikeThrough")}><Strikethrough size={16}/></button></div><div className="tool-group"><select aria-label="Font family" defaultValue="Arial" onChange={e=>format("fontName",e.target.value)}><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Courier New">Courier New</option><option value="Trebuchet MS">Trebuchet</option><option value="Times New Roman">Times New Roman</option></select><select aria-label="Text size" defaultValue="3" onChange={e=>format("fontSize",e.target.value)}><option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">XL</option><option value="6">XXL</option></select></div><div className="tool-group color-tool"><label title="Text color">A<input aria-label="Text color" type="color" defaultValue="#d5d7e0" onChange={e=>format("foreColor",e.target.value)}/></label><label title="Highlight color"><Highlighter size={15}/><input aria-label="Highlight color" type="color" defaultValue="#6550a4" onChange={e=>format("hiliteColor",e.target.value)}/></label></div><div className="tool-group"><button type="button" title="Align left" onMouseDown={e=>e.preventDefault()} onClick={()=>format("justifyLeft")}><AlignLeft size={16}/></button><button type="button" title="Align center" onMouseDown={e=>e.preventDefault()} onClick={()=>format("justifyCenter")}><AlignCenter size={16}/></button><button type="button" title="Align right" onMouseDown={e=>e.preventDefault()} onClick={()=>format("justifyRight")}><AlignRight size={16}/></button></div><div className="tool-group"><button type="button" title="Bulleted list" onMouseDown={e=>e.preventDefault()} onClick={()=>format("insertUnorderedList")}><List size={16}/></button><button type="button" title="Numbered list" onMouseDown={e=>e.preventDefault()} onClick={()=>format("insertOrderedList")}><ListOrdered size={16}/></button><button type="button" title="Block quote" onMouseDown={e=>e.preventDefault()} onClick={()=>format("formatBlock","blockquote")}>❞</button></div><div className="tool-group shape-tools"><span>Shapes</span><button type="button" title="Insert circle" onMouseDown={e=>e.preventDefault()} onClick={()=>insertShape("circle")}>○</button><button type="button" title="Insert square" onMouseDown={e=>e.preventDefault()} onClick={()=>insertShape("square")}>□</button><button type="button" title="Insert triangle" onMouseDown={e=>e.preventDefault()} onClick={()=>insertShape("triangle")}>△</button></div></div><div ref={editorRef} className="note-editor rich-editor" contentEditable suppressContentEditableWarning role="textbox" aria-label="Note content" aria-multiline="true" data-placeholder="Start writing your notes here…" onInput={syncEditor} onBlur={syncEditor}/></div></>:active==="AI Study Room"?<section className="module-page"><div className="eyebrow"><span className="live-dot"/> AI LEARNING WORKSPACE</div><h1>AI Study Room</h1><p>Ask questions about your notes and study topics. AI provider connection is the next integration step.</p><div className="ai-setup-card"><div className="ai-setup-icon"><BrainCircuit size={26}/></div><div><h3>Your study copilot is being connected</h3><p>The chat interface is ready for the secure AI backend. No fake answers are shown while the provider is not configured.</p><span className="integration-tag">Backend integration pending</span></div></div><div className="module-grid"><div className="module-tile"><Sparkles/><h3>Explain a concept</h3><p>Get beginner-friendly explanations from your study material.</p></div><div className="module-tile"><BookOpen/><h3>Summarize notes</h3><p>Turn long documents into clear revision notes.</p></div><div className="module-tile"><GraduationCap/><h3>Practice questions</h3><p>Prepare for exams with topic-wise questions.</p></div></div></section>:active==="Flashcards"?<section className="module-page"><div className="eyebrow"><span className="live-dot"/> ACTIVE RECALL</div><h1>Flashcards</h1><p>Build a revision deck from your own notes.</p><div className="empty-module"><GraduationCap size={30}/><h3>Your flashcard library starts here</h3><p>Open a note and organize key terms into question-and-answer cards. Flashcard generation will be added with the AI service.</p><button className="primary-button" onClick={()=>setActive("My Notes")}>Browse my notes <ArrowRight size={15}/></button></div></section>:active==="Library"?<section className="module-page"><div className="eyebrow"><span className="live-dot"/> DOCUMENT LIBRARY</div><div className="module-title-row"><div><h1>Library</h1><p>Bring your study material into ARC AI.</p></div><button className="primary-button" onClick={()=>fileRef.current?.click()}><UploadCloud size={16}/> Import files</button></div><input ref={fileRef} type="file" multiple accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.xml,.log" hidden onChange={importFiles}/><div className="import-grid"><button className="upload-panel" onClick={()=>fileRef.current?.click()}><UploadCloud size={27}/><h3>Import individual files</h3><p>TXT · Markdown · CSV · JSON · HTML · XML · LOG</p><small>Files are converted into editable ARC notes.</small></button><label className="upload-panel zip-upload"><input type="file" accept=".zip,application/zip" hidden onChange={importZip}/><div className="zip-icon">ZIP</div><h3>Open a ZIP archive</h3><p>Upload a ZIP to inspect its folders and files.</p><small>Up to 100 MB · Up to 1,500 files</small></label></div>{archiveBusy&&<div className="archive-status"><span className="spinner"/> Reading archive and building file index…</div>}{archiveError&&<div className="archive-error">{archiveError}</div>}{archive.length>0&&<section className="archive-browser"><div className="archive-heading"><div><span className="archive-kicker">ARCHIVE EXPLORER</span><h3>{archiveName}</h3><p>{archive.length} files indexed · {archive.filter(x=>x.supported).length} extractable text documents</p></div><button className="primary-button" onClick={extractAllSupported}>Extract supported files <ArrowRight size={15}/></button></div><div className="archive-controls"><label className="archive-search"><Search size={15}/><input value={archiveFilter} onChange={e=>setArchiveFilter(e.target.value)} placeholder="Filter archive files…"/></label><span>{archive.filter(x=>x.path.toLowerCase().includes(archiveFilter.toLowerCase())).length} shown</span></div><div className="archive-layout"><div className="archive-tree">{archive.filter(x=>x.path.toLowerCase().includes(archiveFilter.toLowerCase())).map(entry=><button key={entry.path} className={`archive-file ${archiveSelected===entry.path?"selected":""}`} onClick={()=>setArchiveSelected(entry.path)}><FileText size={15}/><span>{entry.path}</span><small>{entry.kind}</small></button>)}</div><div className="archive-preview">{(()=>{const entry=archive.find(x=>x.path===archiveSelected);return entry?<><div className="preview-file-head"><div><strong>{entry.path.split("/").pop()}</strong><small>{entry.path} · {entry.size.toLocaleString()} bytes</small></div><span className={entry.supported?"extract-ready":"extract-unsupported"}>{entry.supported?"TEXT EXTRACTABLE":"PREVIEW ONLY"}</span></div>{entry.supported?<pre>{entry.text||"No text content found."}</pre>:<div className="preview-empty"><FileText size={25}/><strong>This file is indexed, but text extraction is not available for this format yet.</strong><small>Archive path and file metadata are available.</small></div>}<div className="preview-actions"><button className="secondary-button" onClick={()=>{const blob=new Blob([entry.text||""],{type:"text/plain"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=entry.path.split("/").pop()||"extracted.txt";a.click();URL.revokeObjectURL(url)}} disabled={!entry.supported||!entry.text}>Download extracted text</button><button className="primary-button" onClick={()=>extractArchiveEntry(entry)} disabled={!entry.supported||!entry.text||entry.text.startsWith("[Skipped:")}>Add to My Notes <ArrowRight size={14}/></button></div></>:<div className="preview-empty">Choose a file to preview its extracted content.</div>})()}</div></div></section>}<h3 className="library-heading">Your documents · {notes.length}</h3><div className="library-list">{notes.map(n=><button key={n.id} className="library-row" onClick={()=>openNote(n)}><FileText/><span><strong>{n.title}</strong><small>{n.subject} · {n.updated}</small></span><ArrowRight size={16}/></button>)}</div></section>:<><section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> YOUR PERSONAL KNOWLEDGE SPACE</div><h1>{active==="Overview"?"Good morning, Rohith":active}<span className="wave">✦</span></h1><p>Your ideas, notes and learning — all in one intelligent workspace.</p></div><button className="primary-button" onClick={createNote}><Plus size={17}/> New note</button></section>
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
