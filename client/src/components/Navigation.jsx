import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';

function Navigation({ theme, onToggleTheme }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  return (
    <>
      <nav className="navigation">
        <div className="nav-container">
          <div className="nav-logo">
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
          </div>

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
            <NavLink to="/chat" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">AI Chat</span>
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-text">Profile</span>
            </NavLink>
          </div>

          <button type="button" className="theme-toggle-btn" onClick={onToggleTheme}>
              <span className="nav-text">{theme === 'dark' ? 'Light' : 'Dark'}</span>
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
              Ritik Barik (Zavris) is the developer behind HabytARC, building practical products that make daily progress easy to maintain.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <a className="about-contact-link" href="mailto:proffzavris@gmail.com">Email: proffzavris@gmail.com</a>
              <a className="about-contact-link" href="https://www.linkedin.com/in/ritikbarik/" target="_blank" rel="noreferrer">LinkedIn: linkedin.com/in/ritikbarik</a>
              <a className="about-contact-link" href="https://instagram.com/ritikkbarik" target="_blank" rel="noreferrer">Instagram: instagram.com/ritikkbarik</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Navigation;
