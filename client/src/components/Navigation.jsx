import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

function Navigation({ theme, onToggleTheme, basePath = '' }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const isDark = theme === 'dark';
  const themeIcon = isDark ? '☀' : '🌙';
  const themeAria = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  const resolvePath = (path) => {
    if (!basePath) return path;
    if (path === '/') return `${basePath}/home`;
    return `${basePath}${path}`;
  };

  return (
    <>
      <nav className="navigation">
        <div className="nav-container">
          <Link to={resolvePath('/')} className="nav-logo">
            {!logoFailed ? (
              <img
                src="/logo.png"
                alt="HabytARC"
                className="brand-logo"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span>HabytARC</span>
            )}
          </Link>

          <button type="button" className="nav-credit nav-credit-btn" onClick={() => setShowAbout(true)}>
            Developed by Zavris
          </button>

          <div className="nav-links">
            <NavLink to={resolvePath('/')} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Home</span>
            </NavLink>
            <NavLink to={resolvePath('/calendar')} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Calendar</span>
            </NavLink>
            <NavLink to={resolvePath('/stats')} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Stats</span>
            </NavLink>
            <NavLink to={resolvePath('/exam-mode')} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Exam Mode</span>
            </NavLink>
            <NavLink to={resolvePath('/habits')} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Habits</span>
            </NavLink>
            <NavLink to={resolvePath('/todo')} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">To-Do</span>
            </NavLink>
            <NavLink to={resolvePath('/chat')} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">AI Chat</span>
            </NavLink>
            <NavLink to={resolvePath('/connect')} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Connect</span>
            </NavLink>
            <NavLink to={resolvePath('/profile')} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Profile</span>
            </NavLink>
          </div>

          <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label={themeAria} title={themeAria}>
              <span className="theme-toggle-icon" aria-hidden="true">{themeIcon}</span>
          </button>
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
            Zavris is the developer behind HabytARC, building practical products that make daily progress easy to maintain.
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
