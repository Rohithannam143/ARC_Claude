import { useMemo, useState } from "react";
import {
  Activity, ArrowRight, Bell, BookOpen,
  BrainCircuit, Check, ChevronDown, FilePlus2, FileText,
  FolderOpen, GraduationCap, LayoutDashboard, Lightbulb, Menu,
  MessageSquareText, MoreHorizontal, Plus, Search, Settings2,
  Sparkles, Star, UploadCloud, X
} from "lucide-react";

type Note = { id: number; title: string; subject: string; updated: string; color: string; excerpt: string };

const starterNotes: Note[] = [
  { id: 1, title: "Introduction to Artificial Intelligence", subject: "Artificial Intelligence", updated: "Today · 10:42 AM", color: "violet", excerpt: "Core concepts, intelligent agents, problem-solving and search strategies." },
  { id: 2, title: "Compiler Design — Lexical Analysis", subject: "Compiler Design", updated: "Yesterday", color: "blue", excerpt: "Tokens, patterns, lexemes and the role of a lexical analyser." },
  { id: 3, title: "Cloud Computing Fundamentals", subject: "Cloud Computing", updated: "Nov 10", color: "orange", excerpt: "Service models, deployment models, virtualization and cloud architecture." },
];

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "My Notes", icon: FileText },
  { label: "Library", icon: FolderOpen },
  { label: "AI Study Room", icon: BrainCircuit },
  { label: "Flashcards", icon: GraduationCap },
];

function App() {
  const [active, setActive] = useState("Overview");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState(starterNotes);
  const [showCreate, setShowCreate] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const filteredNotes = useMemo(
    () => notes.filter((note) => (note.title + note.subject + note.excerpt).toLowerCase().includes(query.toLowerCase())),
    [notes, query]
  );

  function createNote() {
    const title = newTitle.trim();
    if (!title) return;
    setNotes([{ id: Date.now(), title, subject: "Unsorted", updated: "Just now", color: "violet", excerpt: "Your new note is ready. Start adding your ideas." }, ...notes]);
    setNewTitle("");
    setShowCreate(false);
    setActive("My Notes");
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><Sparkles size={19} /></div>
          <span className="brand-name">arc<span>.</span></span>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <button className="workspace-switch">
          <div className="workspace-avatar">R</div>
          <span><strong>My workspace</strong><small>Personal plan</small></span>
          <ChevronDown size={15} />
        </button>
        <button className="new-note-button" onClick={() => setShowCreate(true)}><Plus size={17} /> Create new note <span>⌘ K</span></button>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${active === label ? "active" : ""}`} onClick={() => { setActive(label); setMobileNav(false); }}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === "AI Study Room" && <span className="nav-new">NEW</span>}
            </button>
          ))}
        </nav>
        <div className="nav-caption collections-caption">YOUR COLLECTIONS <button aria-label="Add collection"><Plus size={14} /></button></div>
        <button className="collection-item"><span className="collection-dot dot-purple" /> Semester 5</button>
        <button className="collection-item"><span className="collection-dot dot-blue" /> Exam preparation</button>
        <button className="collection-item"><span className="collection-dot dot-orange" /> Project research</button>
        <div className="sidebar-bottom">
          <div className="storage-card"><div className="storage-heading"><span>Workspace storage</span><span>12%</span></div><div className="storage-track"><i /></div><small>1.2 GB of 10 GB used</small></div>
          <button className="nav-item"><Settings2 size={17} /><span>Settings</span></button>
          <div className="profile-row"><div className="profile-avatar">R</div><span><strong>Rohith</strong><small>Free workspace</small></span><MoreHorizontal size={18} /></div>
        </div>
      </aside>

      {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close menu" />}

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={19} /></button><span>Workspace</span><span className="crumb-slash">/</span><strong>{active}</strong></div>
          <div className="topbar-actions">
            <label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search anything..." /><kbd>⌘ K</kbd></label>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button>
            <div className="top-avatar">R</div>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="live-dot" /> YOUR PERSONAL KNOWLEDGE SPACE</div><h1>{active === "Overview" ? "Good morning, Rohith" : active}<span className="wave">✦</span></h1><p>{active === "Overview" ? "Your ideas, notes and learning — all in one intelligent workspace." : "Everything you need, organized in one place."}</p></div>
            <button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={17} /> New note</button>
          </section>

          <section className="hero-card">
            <div className="hero-copy"><div className="hero-label"><Sparkles size={14} /> MEET YOUR AI STUDY PARTNER</div><h2>Think clearly.<br /><em>Learn deeply.</em></h2><p>Turn scattered information into structured knowledge. Ask questions, understand complex topics and make every study session count.</p><button className="hero-button" onClick={() => setActive("AI Study Room")}>Open AI Study Room <ArrowRight size={16} /></button></div>
            <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orb-core"><BrainCircuit size={54} strokeWidth={1.15} /></div><div className="float-chip chip-top"><Sparkles size={14} /> AI insights</div><div className="float-chip chip-bottom"><Check size={14} /> Knowledge organized</div><div className="tiny-star star-a">✳</div><div className="tiny-star star-b">✦</div></div>
          </section>

          <section className="stats-grid">
            <div className="stat-card"><div className="stat-icon purple-icon"><FileText size={18} /></div><div><span>Total notes</span><strong>{notes.length.toString().padStart(2, "0")}</strong><small><span className="stat-positive">↗ 2</span> this week</small></div></div>
            <div className="stat-card"><div className="stat-icon blue-icon"><BookOpen size={18} /></div><div><span>Study collections</span><strong>03</strong><small>Across your subjects</small></div></div>
            <div className="stat-card"><div className="stat-icon orange-icon"><Activity size={18} /></div><div><span>Learning streak</span><strong>05 <small className="days">days</small></strong><small><span className="stat-positive">Keep it up!</span></small></div></div>
            <div className="stat-card"><div className="stat-icon green-icon"><Lightbulb size={18} /></div><div><span>AI summaries</span><strong>12</strong><small>Knowledge made simple</small></div></div>
          </section>

          <section className="section-heading"><div><h3>Continue learning</h3><p>Pick up right where you left off.</p></div><button className="text-button" onClick={() => setActive("My Notes")}>View all <ArrowRight size={15} /></button></section>
          <section className="notes-grid">
            {filteredNotes.length ? filteredNotes.map((note) => <article className="note-card" key={note.id}><div className="note-card-top"><div className={`note-icon ${note.color}`}><FileText size={18} /></div><button className="icon-button" aria-label="More note actions"><MoreHorizontal size={18} /></button></div><div className="note-subject">{note.subject}</div><h4>{note.title}</h4><p>{note.excerpt}</p><div className="note-footer"><span>{note.updated}</span><button aria-label={`Open ${note.title}`} onClick={() => setActive("My Notes")}><ArrowRight size={16} /></button></div></article>) : <div className="empty-state"><Search size={22} /><strong>No notes found</strong><span>Try another search term.</span></div>}
            <button className="add-note-card" onClick={() => setShowCreate(true)}><span><Plus size={20} /></span><strong>Create a new note</strong><small>Capture a thought or start studying</small></button>
          </section>

          <section className="bottom-grid">
            <div className="tip-card"><div className="tip-icon"><Lightbulb size={18} /></div><div><span className="tip-label">A LITTLE STUDY TIP</span><h4>Small sessions. Big progress.</h4><p>Try the 25-minute focus method: study one concept, take a short break, then explain what you learned in your own words.</p></div><Star className="tip-star" size={17} /></div>
            <div className="quick-card"><h3>Quick actions</h3><button onClick={() => setShowCreate(true)}><FilePlus2 size={17} /><span>Write a new note</span><ArrowRight size={15} /></button><button onClick={() => setActive("Library")}><UploadCloud size={17} /><span>Import a document</span><ArrowRight size={15} /></button><button onClick={() => setActive("AI Study Room")}><MessageSquareText size={17} /><span>Ask AI a question</span><ArrowRight size={15} /></button></div>
          </section>
          <footer className="footer"><span>ARC AI <span className="footer-dot">·</span> Your knowledge, connected.</span><span>Made for curious minds <Sparkles size={12} /></span></footer>
        </div>
      </main>

      {showCreate && <div className="modal-backdrop" onClick={() => setShowCreate(false)}><div className="create-modal" onClick={(e) => e.stopPropagation()}><div className="modal-heading"><div><span className="modal-kicker">NEW DOCUMENT</span><h3>Create a note</h3></div><button className="icon-button" onClick={() => setShowCreate(false)} aria-label="Close"><X size={19} /></button></div><label className="modal-label" htmlFor="note-title">Note title</label><input id="note-title" autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createNote()} placeholder="e.g. Operating Systems — Unit 1" /><div className="modal-actions"><button className="secondary-button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" disabled={!newTitle.trim()} onClick={createNote}>Create note <ArrowRight size={15} /></button></div></div></div>}
    </div>
  );
}

export default App;