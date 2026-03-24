import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

function Navigation({ theme, onToggleTheme, basePath = '', appVariant = 'habytarc' }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const isDark = theme === 'dark';
  const themeIcon = isDark ? '☀' : '🌙';
  const themeAria = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  const isZenvy = appVariant === 'zenvy';
  const switchTarget = isZenvy
    ? { to: '/habytarc/home', label: 'Switch to HabytARC' }
    : { to: '/zenvy/exam-mode', label: 'Switch to Zenvy' };
  const resolvePath = (path) => {
    if (!basePath) return path;
    if (path === '/') return isZenvy ? `${basePath}/exam-mode` : `${basePath}/home`;
    return `${basePath}${path}`;
  };
  const navItems = isZenvy
    ? [
        { path: '/exam-mode', label: 'Exam Mode' },
        { path: '/profile', label: 'Profile' }
      ]
    : [
        { path: '/', label: 'Home' },
        { path: '/calendar', label: 'Calendar' },
        { path: '/stats', label: 'Stats' },
        { path: '/habits', label: 'Habits' },
        { path: '/todo', label: 'To-Do' },
        { path: '/chat', label: 'AI Chat' },
        { path: '/profile', label: 'Profile' }
      ];

  return (
    <>
      <nav className="navigation">
        <div className="nav-container">
          <div className="nav-brand-group">
            <Link to={resolvePath('/')} className="nav-logo">
              {!isZenvy && !logoFailed && (
                <img
                  src="/logo.png"
                  alt="HabytARC"
                  className="brand-logo"
                  onError={() => setLogoFailed(true)}
                />
              )}
              {isZenvy ? (
                <span className="zenvy-wordmark">Zenvy</span>
              ) : (
                <>
                  <span className="habytarc-wordmark">HabytARC</span>
                  <span className="mobile-brand-title">HabytARC</span>
                </>
              )}
              {isZenvy && <span className="workspace-chip">Exam Progress Hub</span>}
            </Link>
            <div className="workspace-switch-nav">
              <button
                type="button"
                className="workspace-switch-trigger"
                onClick={() => setShowWorkspaceMenu((prev) => !prev)}
                aria-label={switchTarget.label}
                aria-expanded={showWorkspaceMenu}
              >
                <span className={`workspace-switch-caret ${showWorkspaceMenu ? 'open' : ''}`} aria-hidden="true">▾</span>
              </button>
              {showWorkspaceMenu && (
                <div className="workspace-switch-menu">
                  <Link
                    to={switchTarget.to}
                    className="workspace-switch-link"
                    onClick={() => setShowWorkspaceMenu(false)}
                  >
                    {switchTarget.label}
                  </Link>
                </div>
              )}
            </div>
          </div>

          <button type="button" className="nav-credit nav-credit-btn" onClick={() => setShowAbout(true)}>
            Developed by Zavris
          </button>

          <div className="nav-links">
            {navItems.map((item) => (
              <NavLink key={item.path} to={resolvePath(item.path)} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                <span className="nav-text">{item.label}</span>
              </NavLink>
            ))}
            <Link
              to={switchTarget.to}
              className="nav-link mobile-nav-action"
              aria-label={switchTarget.label}
              title={switchTarget.label}
              onClick={() => setShowWorkspaceMenu(false)}
            >
              <span className="nav-text">⇄</span>
            </Link>
            <button
              type="button"
              className="nav-link nav-link-button mobile-nav-action"
              onClick={onToggleTheme}
              aria-label={themeAria}
              title={themeAria}
            >
              <span className="nav-text">{isDark ? '☀' : '🌙'}</span>
            </button>
          </div>

          <div className="nav-actions">
            <Link
              to={switchTarget.to}
              className="mobile-header-switch"
              aria-label={switchTarget.label}
              title={switchTarget.label}
            >
              <span aria-hidden="true">⇄</span>
            </Link>
            <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label={themeAria} title={themeAria}>
                <span className="theme-toggle-icon" aria-hidden="true">{themeIcon}</span>
            </button>
          </div>
        </div>
      </nav>

      {showAbout && (
        <div className="modal-overlay" onClick={() => setShowAbout(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>About Zavris</h2>
              <button type="button" className="modal-close" onClick={() => setShowAbout(false)}>
                ×
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Zavris is the developer behind HabytARC and Zenvy, building practical products that make daily routines and exam preparation easier to manage.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <a className="about-contact-link" href="mailto:habytarc@gmail.com">Email: habytarc@gmail.com</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Navigation;
