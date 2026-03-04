import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

function Navigation({ theme, onToggleTheme }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const themeLabel = theme ? theme.charAt(0).toUpperCase() + theme.slice(1) : 'Theme';

  return (
    <>
      <nav className="navigation">
        <div className="nav-container">
          <Link to="/" className="nav-logo">
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
            <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Home</span>
            </NavLink>
            <NavLink to="/calendar" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Calendar</span>
            </NavLink>
            <NavLink to="/stats" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Stats</span>
            </NavLink>
            <NavLink to="/habits" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Habits</span>
            </NavLink>
            <NavLink to="/todo" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">To-Do</span>
            </NavLink>
            <NavLink to="/chat" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">AI Chat</span>
            </NavLink>
            <NavLink to="/connect" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Connect</span>
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Profile</span>
            </NavLink>
          </div>

          <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
              <span className="nav-text">Theme: {themeLabel}</span>
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
