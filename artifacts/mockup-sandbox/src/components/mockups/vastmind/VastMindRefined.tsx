import { useState, type FormEvent } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  Check,
  CheckCheck,
  ChevronDown,
  CircleUserRound,
  Heart,
  LockKeyhole,
  Menu,
  MessageCircle,
  MessageSquareText,
  Radio,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UsersRound,
  Video,
  X,
  Zap,
} from "lucide-react";
import "./vastmindrefined.css";

const features = [
  {
    number: "01",
    icon: MessageCircle,
    title: "Keep your people close",
    body: "Private chats, thoughtful voice notes, and group conversations that feel like yours.",
    tone: "blue",
  },
  {
    number: "02",
    icon: Video,
    title: "Catch the good bits",
    body: "A lively feed of short videos, shared finds, polls, and everyday stories.",
    tone: "lilac",
  },
  {
    number: "03",
    icon: UsersRound,
    title: "Find your corner",
    body: "Meet the people nearby who care about the same things you do.",
    tone: "mint",
  },
  {
    number: "04",
    icon: ShoppingBag,
    title: "Back the makers",
    body: "Discover independent shops and keep conversations close to the things you love.",
    tone: "peach",
  },
];

export function VastMindRefined() {
  const [dialog, setDialog] = useState<"join" | "signin" | null>(null);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const openDialog = (kind: "join" | "signin") => {
    setNotice("");
    setEmail("");
    setDialog(kind);
    setMenuOpen(false);
  };

  const submitEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) {
      setNotice("Add your email to continue.");
      return;
    }
    setNotice(`You're on your way. We'll send a sign-in link to ${email.trim()}.`);
  };

  return (
    <main className="vm-refined">
      <header className="vm-header">
        <a href="#home" className="vm-brand" aria-label="VastMind home">
          <span className="vm-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>vastmind</span>
        </a>

        <nav className={`vm-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
          <a href="#inside" onClick={() => setMenuOpen(false)}>What’s inside</a>
          <a href="#shops" onClick={() => setMenuOpen(false)}>For shops</a>
          <a href="#privacy" onClick={() => setMenuOpen(false)}>Privacy</a>
          <button className="vm-mobile-join" onClick={() => openDialog("join")}>Get started <ArrowRight size={15} /></button>
        </nav>

        <div className="vm-header-actions">
          <button className="vm-signin" onClick={() => openDialog("signin")}>Sign in</button>
          <button className="vm-button vm-button-small" onClick={() => openDialog("join")}>
            Get started <ArrowRight size={15} />
          </button>
        </div>
        <button
          className="vm-menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </header>

      <section className="vm-hero" id="home">
        <div className="vm-hero-copy">
          <div className="vm-eyebrow"><span className="vm-live-dot" /> A little closer, every day</div>
          <h1>Your people.<br /><span>Your next move.</span></h1>
          <p className="vm-hero-intro">
            The good stuff happens when everything comes together. Chat, find your community, follow the feed, and discover independent shops—all in one place.
          </p>
          <div className="vm-hero-actions">
            <button className="vm-button" onClick={() => openDialog("join")}>
              Create your VastMind ID <ArrowRight size={17} />
            </button>
            <a className="vm-text-link" href="#inside">Take a look <ArrowDownRight size={16} /></a>
          </div>
          <div className="vm-social-proof">
            <div className="vm-avatar-stack" aria-hidden="true">
              <span className="vm-avatar avatar-a">M</span>
              <span className="vm-avatar avatar-b">J</span>
              <span className="vm-avatar avatar-c">A</span>
              <span className="vm-avatar avatar-d">+</span>
            </div>
            <p><strong>One ID, more of your life.</strong><br />Made for friends, neighborhoods, and small shops.</p>
          </div>
        </div>

        <div className="vm-hero-visual">
          <div className="vm-art-wrap">
            <img
              className="vm-neighborhood-art"
              src="/__mockup/images/vastmindrefined-neighborhood.png"
              alt="A warmly lit neighborhood connected by bright, fine lines at dusk"
            />
            <div className="vm-art-label"><span className="vm-label-line" /> A more connected kind of social</div>
          </div>
          <div className="vm-chat-card">
            <div className="vm-chat-head">
              <div className="vm-chat-person">
                <span className="vm-chat-avatar">S</span>
                <span><strong>Sunday people</strong><small>4 friends · active now</small></span>
              </div>
              <button className="vm-chat-more" aria-label="More conversation options"><ChevronDown size={16} /></button>
            </div>
            <div className="vm-message theirs">Found our next little adventure.</div>
            <div className="vm-message mine">Already saved it for us <Heart size={13} fill="currentColor" /></div>
            <div className="vm-chat-foot"><span>Delivered</span><CheckCheck size={14} /></div>
          </div>
          <div className="vm-float-note"><span className="vm-note-icon"><Sparkles size={16} /></span><span><strong>All in one place</strong><small>More life. Less switching.</small></span></div>
        </div>
      </section>

      <div className="vm-ribbon" aria-label="VastMind features">
        <div className="vm-ribbon-track">
          {["Private chats", "Stories", "Local circles", "Creator shops", "Short videos", "Channels", "Private chats", "Stories", "Local circles", "Creator shops", "Short videos", "Channels"].map((item, index) => (
            <span className="vm-ribbon-item" key={`${item}-${index}`}>{item}<i /></span>
          ))}
        </div>
      </div>

      <section className="vm-inside" id="inside">
        <div className="vm-section-heading">
          <div>
            <p className="vm-kicker">A good place to start</p>
            <h2>The parts of life<br />that belong together.</h2>
          </div>
          <p className="vm-heading-note">Less app-hopping. More being there for the people and places that matter.</p>
        </div>

        <div className="vm-feature-grid">
          {features.map(({ number, icon: Icon, title, body, tone }) => (
            <article className={`vm-feature vm-feature-${tone}`} key={number}>
              <div className="vm-feature-top"><span>{number}</span><Icon size={22} strokeWidth={1.8} /></div>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
              <span className="vm-feature-arrow" aria-hidden="true"><ArrowRight size={16} /></span>
            </article>
          ))}
          <article className="vm-feature vm-feature-wide">
            <div className="vm-wide-copy">
              <p className="vm-kicker">And it still feels like yours</p>
              <h3>Keep your space<br />on your terms.</h3>
              <p>Choose who can reach you, what you share, and where you’re signed in. Your connections stay yours.</p>
              <a href="#privacy" className="vm-text-link">See how privacy works <ArrowRight size={15} /></a>
            </div>
            <div className="vm-privacy-illustration" aria-hidden="true">
              <div className="vm-shield-orbit orbit-one" />
              <div className="vm-shield-orbit orbit-two" />
              <span className="vm-shield"><ShieldCheck size={44} strokeWidth={1.4} /></span>
              <span className="vm-orbit-dot dot-one" />
              <span className="vm-orbit-dot dot-two" />
              <span className="vm-orbit-dot dot-three" />
            </div>
          </article>
        </div>
      </section>

      <section className="vm-shop-section" id="shops">
        <div className="vm-shop-inner">
          <div className="vm-shop-copy">
            <p className="vm-kicker">For the people who make things</p>
            <h2>Your shop belongs<br />with your community.</h2>
            <p>Show what you make, tell the story behind it, and keep customer conversations close to every order.</p>
            <ul>
              <li><span><Check size={14} /></span> A storefront that feels like your own</li>
              <li><span><Check size={14} /></span> Orders and conversations, together</li>
              <li><span><Check size={14} /></span> Share your work where people already are</li>
            </ul>
            <button className="vm-button vm-button-light" onClick={() => openDialog("join")}>Explore VastMind for shops <ArrowRight size={16} /></button>
          </div>
          <div className="vm-shop-preview">
            <div className="vm-shop-preview-head">
              <div><span className="vm-shop-avatar"><BriefcaseBusiness size={17} /></span><span><strong>Fieldnotes Studio</strong><small>Independent goods · Portland</small></span></div>
              <button className="vm-follow-button" onClick={(event) => {
                const button = event.currentTarget;
                const following = button.dataset.following === "true";
                button.dataset.following = String(!following);
                button.innerHTML = following ? "＋ Follow" : "✓ Following";
              }}>＋ Follow</button>
            </div>
            <div className="vm-product-image">
              <div className="vm-sun-disc" />
              <div className="vm-product-object"><span /><i /><b /></div>
              <div className="vm-product-caption">FIELDNOTES <span>OBJECTS FOR EVERYDAY</span></div>
            </div>
            <div className="vm-product-row">
              <div><strong>Sunday ceramic set</strong><small>Made slowly, in small batches</small></div>
              <span>$48</span>
            </div>
            <div className="vm-shop-preview-foot"><span><MessageSquareText size={14} /> Message the maker</span><span><Bell size={14} /> New collection alert</span></div>
          </div>
        </div>
      </section>

      <section className="vm-privacy-section" id="privacy">
        <div className="vm-privacy-copy">
          <span className="vm-privacy-symbol"><LockKeyhole size={20} /></span>
          <p className="vm-kicker">Your space, your call</p>
          <h2>Connection feels better<br />with a little control.</h2>
          <p>Make the choices that feel right for you. Clear, useful privacy tools are part of the experience—not hidden in the fine print.</p>
        </div>
        <div className="vm-privacy-list">
          <div><span className="vm-list-icon"><CircleUserRound size={17} /></span><span><strong>Choose who finds you</strong><small>Manage profile discovery and status visibility</small></span><Check size={16} /></div>
          <div><span className="vm-list-icon"><ShieldCheck size={17} /></span><span><strong>Keep chats comfortable</strong><small>Block and report whenever you need to</small></span><Check size={16} /></div>
          <div><span className="vm-list-icon"><Zap size={17} /></span><span><strong>Own your sign-ins</strong><small>Review devices and manage passkeys</small></span><Check size={16} /></div>
        </div>
      </section>

      <section className="vm-final-cta">
        <div className="vm-cta-star star-one"><Radio size={18} /></div>
        <div className="vm-cta-star star-two"><MessageCircle size={20} /></div>
        <p className="vm-kicker">Make room for more of what matters</p>
        <h2>All your socials.<br /><span>One VastMind.</span></h2>
        <p className="vm-cta-subtitle">Start with your people. See where it takes you.</p>
        <button className="vm-button" onClick={() => openDialog("join")}>Create your VastMind ID <ArrowRight size={16} /></button>
        <div className="vm-cta-lock"><LockKeyhole size={13} /> Your ID. Your connections. Your call.</div>
      </section>

      <footer className="vm-footer">
        <a href="#home" className="vm-brand"><span className="vm-mark" aria-hidden="true"><span /><span /><span /><span /></span><span>vastmind</span></a>
        <span>Made for real friends, real neighborhoods, and real shops.</span>
        <button onClick={() => openDialog("signin")}>Already here? <strong>Sign in</strong></button>
      </footer>

      {dialog && (
        <div className="vm-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDialog(null);
        }}>
          <section className="vm-modal" role="dialog" aria-modal="true" aria-labelledby="vm-modal-title">
            <button className="vm-modal-close" aria-label="Close dialog" onClick={() => setDialog(null)}><X size={18} /></button>
            <span className="vm-modal-mark"><MessageCircle size={21} /></span>
            <p className="vm-kicker">{dialog === "join" ? "Your people are here" : "Welcome back"}</p>
            <h2 id="vm-modal-title">{dialog === "join" ? "Start with your email." : "Good to see you again."}</h2>
            <p className="vm-modal-copy">We’ll send you a secure link to {dialog === "join" ? "create your VastMind ID" : "sign in to VastMind"}.</p>
            <form onSubmit={submitEmail}>
              <label htmlFor="vm-email">Email address</label>
              <input id="vm-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoFocus required />
              <button className="vm-button" type="submit">Continue with email <ArrowRight size={16} /></button>
            </form>
            {notice && <p className="vm-modal-notice" role="status">{notice}</p>}
            <p className="vm-modal-foot"><LockKeyhole size={12} /> Your email is only used to sign you in.</p>
          </section>
        </div>
      )}
    </main>
  );
}
