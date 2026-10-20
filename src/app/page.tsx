import Link from "next/link";
import { ArrowDown, ArrowRight, AudioLines, FileUp, LockKeyhole, MessageCircle, Play, Sparkles, Users, Video } from "lucide-react";
import { CordMark } from "@/components/cord-mark";

const features = [
  { icon: MessageCircle, title: "Conversations that flow", text: "Fast, thoughtful messaging that keeps your community in sync." },
  { icon: Users, title: "A space of your own", text: "Bring your people together in channels made for how you connect." },
  { icon: AudioLines, title: "Here, together", text: "Drop into voice and spend time with the people who get you." },
  { icon: Video, title: "Face-to-face, anywhere", text: "Make room for video when a message just isn't quite enough." },
  { icon: FileUp, title: "Share the good stuff", text: "Send files and ideas right where the conversation happens." },
  { icon: LockKeyhole, title: "Your space, your say", text: "Thoughtful controls help you decide who can find and reach you." },
];

function ProductPreview() {
  return (
    <div className="preview-window" aria-label="Cord chat interface preview">
      <div className="preview-titlebar">
        <span className="window-dots"><i /><i /><i /></span>
        <span><CordMark size={18} /> Cord / studio-house</span>
        <span className="preview-live"><i /> LIVE SPACE</span>
      </div>
      <div className="preview-app">
        <aside className="preview-rail">
          <div className="rail-logo"><CordMark size={21} /></div>
          <div className="rail-icon selected"><MessageCircle size={17} /></div>
          <div className="rail-icon"><Users size={17} /></div>
          <div className="rail-icon"><Sparkles size={17} /></div>
          <div className="rail-divider" />
          <div className="rail-avatar">S</div>
          <div className="rail-avatar alt">A</div>
          <div className="rail-avatar pink">M</div>
          <div className="rail-add">+</div>
        </aside>
        <aside className="preview-channels">
          <div className="server-name">Studio House <span>⌄</span></div>
          <div className="channel-label">YOUR SPACE</div>
          <div className="channel-row"><span>⌂</span> Overview</div>
          <div className="channel-label">THE LOUNGE</div>
          <div className="channel-row active"><span>#</span> general</div>
          <div className="channel-row"><span>#</span> work-in-progress</div>
          <div className="channel-row"><span>#</span> inspiration</div>
          <div className="channel-label">HANG OUT</div>
          <div className="channel-row"><AudioLines size={14} /> Open room</div>
          <div className="mini-profile"><span className="avatar small">J</span><span>jules<small>Online</small></span><span className="profile-dots">•••</span></div>
        </aside>
        <section className="preview-chat">
          <div className="chat-head"><span><b>#</b> general</span><span className="head-actions">⌕　♧　☰</span></div>
          <div className="chat-content">
            <div className="welcome-block"><div className="welcome-icon"><CordMark size={25} /></div><h3>A good place to start.</h3><p>This is the beginning of <b>#general</b>. Say hello to your people.</p></div>
            <div className="preview-message"><span className="avatar lilac">A</span><div><b>aria <small>Today at 10:42 AM</small></b><p>Morning everyone! Dropping the first sketches here ✨</p></div></div>
            <div className="preview-message"><span className="avatar green">M</span><div><b>milo <small>Today at 10:44 AM</small></b><p>These are lovely. The contrast feels just right.</p></div></div>
            <div className="preview-message"><span className="avatar orange">J</span><div><b>jules <small>Today at 10:47 AM</small></b><p>Agreed. <span className="mention">@aria</span> the second one is my favorite.</p></div></div>
            <div className="chat-compose"><span>＋</span><span>Message #general</span><span className="compose-tools">☺　↗</span></div>
          </div>
        </section>
        <aside className="preview-members"><div className="member-title">HERE NOW <span>04</span></div>{[["A","aria","lilac"],["M","milo","green"],["J","jules","orange"],["R","remy","pink"]].map(([letter,name,color]) => <div className="member" key={name}><span className={`avatar ${color}`}>{letter}</span><span>{name}<small>In the studio</small></span><i /></div>)}</aside>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="landing">
      <header className="site-nav">
        <Link href="/" className="brand"><CordMark size={34} /><span>Cord</span></Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#features">Features</a><a href="#communities">Communities</a><a href="#safety">Safety</a>
        </nav>
        <div className="nav-actions"><Link href="/login" className="nav-login">Log in</Link><Link href="/register" className="button button-light nav-cta">Get started <ArrowRight size={15} /></Link></div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> A little more together</div>
          <h1>Your people.<br />Your space.<br /><span>Your Cord.</span></h1>
          <p className="hero-subtitle">A home for the conversations, communities, and little moments that make being online feel more human.</p>
          <div className="hero-actions"><Link href="/register" className="button button-light">Open Cord <ArrowRight size={16} /></Link><a href="#features" className="button button-quiet">Take a look <ArrowDown size={15} /></a></div>
          <div className="hero-note"><span className="online-stack"><i>J</i><i>A</i><i>M</i></span><span>Made for your kind of people.</span></div>
        </div>
        <div className="hero-art"><div className="art-glow" /><div className="preview-wrap"><ProductPreview /></div><div className="floating-note"><span className="note-spark">✳</span><span><b>A space to be yourself</b><small>Stay a little longer.</small></span></div><div className="art-caption">01 <span /> A place to find your people</div></div>
      </section>

      <section className="intro-strip" id="communities"><span>LESS NOISE. MORE CONNECTION.</span><p>Not another place to scroll.<br /><em>A place to belong.</em></p><span className="strip-mark">C<span>.</span></span></section>

      <section className="features-section" id="features">
        <div className="section-heading"><div><div className="eyebrow">Made for being together</div><h2>Good conversations<br />make a <em>good thing.</em></h2></div><p>From a quick hello to your favorite corner of the internet — Cord makes room for all of it.</p></div>
        <div className="feature-grid">{features.map(({ icon: Icon, title, text }, index) => <article className="feature-card" key={title}><div className="feature-top"><div className="feature-icon"><Icon size={19} strokeWidth={1.7} /></div><span>0{index + 1}</span></div><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>

      <section className="safety-section" id="safety"><div className="safety-mark"><LockKeyhole size={23} /></div><div><div className="eyebrow">A little peace of mind</div><h2>Your space should<br />feel like <em>yours.</em></h2><p>Choose who can reach you and how you show up. We build with care for your privacy — and we’ll never call Cord end-to-end encrypted unless it truly is.</p><Link href="/register" className="text-link">Make your space <ArrowRight size={15} /></Link></div><div className="safety-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core"><CordMark size={53} /></div><span className="orbit-label">YOUR SPACE, YOUR RULES</span></div></section>

      <section className="faq-section"><div><div className="eyebrow">A few good questions</div><h2>Curious?<br /><em>Fair enough.</em></h2></div><div className="faq-list"><details><summary>What is Cord? <span>+</span></summary><p>Cord is a community and communication platform for the people and groups you want to stay close to.</p></details><details><summary>Is Cord free to use? <span>+</span></summary><p>Cord is being built as a welcoming place to connect. Create an account and start bringing your people together.</p></details><details><summary>Can I make a private community? <span>+</span></summary><p>Yes. Communities can be private, and invitations let you choose who gets to join.</p></details><details><summary>Does Cord support voice and video? <span>+</span></summary><p>Voice and video are part of the direction for Cord. Calls need configured media infrastructure before they can be offered reliably.</p></details></div></section>

      <section className="closing-cta"><div className="closing-symbol"><CordMark size={36} /></div><div><div className="eyebrow">Your people are out there</div><h2>Come find your <em>corner.</em></h2></div><Link href="/register" className="button button-light">Get started <ArrowRight size={16} /></Link></section>
      <footer className="site-footer"><Link href="/" className="footer-brand"><CordMark size={23} /><span>Cord</span></Link><span className="footer-tagline">Better. Faster. Together.</span><div className="footer-links"><a href="#safety">Privacy</a><a href="#safety">Terms</a><a href="mailto:hello@cord.example">Contact</a><a href="#features">Status</a></div><span className="copyright">© 2026 Cord</span></footer>
      <Link href="/login" className="sr-only"><Play size={1} />Log in to Cord</Link>
    </main>
  );
}
