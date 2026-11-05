import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowUp, AudioWaveform, CircleAlert, CircleCheck, LoaderCircle, Menu, Moon, Sun, User as UserIcon, X } from "lucide-react";
import { Logo } from "./Brand";
import { useTheme } from "../theme";
import { useModel } from "../model";
import { useAuth } from "../auth";

const NAV: [string, string][] = [
  ["/", "Home"],
  ["/analyze", "Analyze"],
  ["/evaluation", "Evaluation"],
  ["/model", "Model info"],
  ["/about", "About"],
  ["/faq", "FAQ"]
];

function StatusBadge() {
  const m = useModel();
  const ready = m.phase === "ready" && m.status.trained;
  const profileLabel =
    m.phase === "ready" && m.status.profile === "emotion2vec_experimental"
      ? "Experimental"
      : m.phase === "ready" && (m.status.profile === "staging" || m.status.profile === "candidate_option2")
      ? "Staging"
      : m.phase === "ready" && (m.status.profile === "svm_rollback" || m.status.profile === "svm")
      ? "SVM Rollback"
      : "Production";
  const text = m.phase === "loading"
    ? "Checking"
    : m.phase === "offline"
    ? "Offline"
    : ready
    ? `Model ready (${profileLabel})`
    : m.status.state === "incompatible"
    ? "Incompatible"
    : "Not trained";
  const Icon = m.phase === "loading" ? LoaderCircle : ready ? CircleCheck : CircleAlert;
  return (
    <span className={`badge ${ready ? "ok" : "warn"}`} role="status">
      <Icon size={13} aria-hidden="true" />
      <span className="badge-text-full">{text}</span>
      <span className="badge-text-short">{ready ? profileLabel : text}</span>
    </span>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const prev = useRef(pathname);

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
    if (prev.current === pathname) return;
    prev.current = pathname;
    const h1 = document.querySelector<HTMLElement>("main h1");
    h1?.setAttribute("tabindex", "-1");
    h1?.focus({ preventScroll: true });
  }, [pathname]);

  // Lock background scroll when mobile menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onScroll = () => {
      setShowTop(window.scrollY > 500);
      setScrolled(window.scrollY > 40);
    };
    onScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const home = pathname === "/";
  const isFullPageVideo =
    pathname === "/login" ||
    pathname === "/signin" ||
    pathname === "/register" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/contact";
  const showCta = pathname !== "/analyze" && !home && !isFullPageVideo && pathname !== "/profile";

  return (
    <div className={`app-shell ${home ? "home-shell" : isFullPageVideo ? "auth-shell" : "standard-shell"}`}>
      <a className="skip" href="#main">Skip to content</a>

      <header
        className={`site-header ${home ? "over-hero" : ""} ${scrolled ? "scrolled solid" : ""} ${open ? "menu-open" : ""}`}
      >
        <div className="wrap bar">
          <Link to="/" className="brand" aria-label="Speech Emotion Recognition, home">
            <Logo size={38} />
            <span className="brand-name">Speech Emotion Recognition</span>
          </Link>

          {/* Backdrop for mobile drawer - placed before site-nav so drawer stacks above it */}
          {open && (
            <div
              className="menu-backdrop"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* Desktop & Mobile Navigation */}
          <nav
            id="site-nav"
            className={`site-nav ${open ? "open" : ""}`}
            aria-label="Main Navigation"
          >
            {/* Mobile Drawer Header: ONLY visible inside mobile drawer when opened */}
            <div className="mobile-menu-header">
              <div className="mobile-menu-brand">
                <Logo size={22} />
                <span className="mobile-brand-title">Menu</span>
              </div>
              <button
                type="button"
                className="icon-btn mobile-close-btn"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="nav-links">
              {NAV.map(([to, text]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                >
                  {text}
                </NavLink>
              ))}
            </div>

            {/* Mobile Drawer Auth Links */}
            <div className="mobile-auth-section">
              {user ? (
                <NavLink
                  to="/profile"
                  className="mobile-only-link"
                  onClick={() => setOpen(false)}
                >
                  <UserIcon size={15} aria-hidden="true" />
                  <span>Profile ({user.full_name.split(" ")[0]})</span>
                </NavLink>
              ) : (
                <NavLink
                  to="/login"
                  className="mobile-only-link"
                  onClick={() => setOpen(false)}
                >
                  <UserIcon size={15} aria-hidden="true" />
                  <span>Sign In</span>
                </NavLink>
              )}

              <button
                type="button"
                className="mobile-only-link mobile-theme-toggle"
                onClick={() => {
                  toggle();
                  setOpen(false);
                }}
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              >
                {theme === "dark" ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
                <span>{theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}</span>
              </button>
            </div>
          </nav>

          <div className="tools">
            <StatusBadge />

            {user ? (
              <Link to="/profile" className="nav-profile-btn" aria-label="User Profile">
                <UserIcon size={14} aria-hidden="true" />
                <span className="nav-user-name">{user.full_name.split(" ")[0]}</span>
              </Link>
            ) : (
              <Link to="/login" className="nav-signin-btn">
                <span>Sign In</span>
              </Link>
            )}

            <button
              type="button"
              className="icon-btn theme-toggle-btn"
              onClick={toggle}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            </button>

            <button
              type="button"
              className="icon-btn menu-btn"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="site-nav"
              aria-label={open ? "Close menu" : "Open menu"}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main id="main" className={home ? "home-main" : "standard-main"}>
        {children}
      </main>

      {!isFullPageVideo && (
        <footer className="site-footer">
          <div className="wrap foot">
            <div className="foot-brand">
              <Logo size={28} />
              <p>Speech Emotion Recognition. Machine learning research platform trained on CREMA-D acted speech. Predictions represent acoustic pattern estimates.</p>
            </div>
            <ul aria-label="Footer Navigation">
              <li><Link to="/privacy">Privacy</Link></li>
              <li><Link to="/terms">Terms</Link></li>
              <li><Link to="/faq">FAQ</Link></li>
              <li><Link to="/contact">Contact</Link></li>
            </ul>
          </div>
        </footer>
      )}

      {showCta && (
        <div className="sticky-cta">
          <Link className="btn primary block" to="/analyze">
            <AudioWaveform size={17} aria-hidden="true" />
            <span>Analyze audio</span>
          </Link>
        </div>
      )}

      {showTop && (
        <button
          className="to-top"
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            })
          }
          aria-label="Back to top"
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
