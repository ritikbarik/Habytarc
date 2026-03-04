import React from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Home from './Home';
import Calendar from './Calendar';
import Stats from './Stats';
import Habits from './Habits';
import Todo from './Todo';
import AIChat from './AIChat';
import Profile from './Profile';
import Feedback from './Feedback';

const previewUser = {
  uid: 'preview-user',
  displayName: 'Preview User',
  email: 'preview@habytarc.app'
};

const previewUserData = {
  name: 'Preview User',
  email: 'preview@habytarc.app',
  cheatDay: 'sunday',
  career: 'general',
  picture: '',
  createdAt: new Date().toISOString()
};

const previewThemes = ['dark', 'light'];

function PeekNav() {
  return (
    <div className="peek-nav-wrap">
      <div className="peek-nav">
        <NavLink to="/peek/home" className={({ isActive }) => isActive ? 'peek-nav-link active' : 'peek-nav-link'}>Home</NavLink>
        <NavLink to="/peek/calendar" className={({ isActive }) => isActive ? 'peek-nav-link active' : 'peek-nav-link'}>Calendar</NavLink>
        <NavLink to="/peek/stats" className={({ isActive }) => isActive ? 'peek-nav-link active' : 'peek-nav-link'}>Stats</NavLink>
        <NavLink to="/peek/habits" className={({ isActive }) => isActive ? 'peek-nav-link active' : 'peek-nav-link'}>Habits</NavLink>
        <NavLink to="/peek/todo" className={({ isActive }) => isActive ? 'peek-nav-link active' : 'peek-nav-link'}>To-Do</NavLink>
        <NavLink to="/peek/chat" className={({ isActive }) => isActive ? 'peek-nav-link active' : 'peek-nav-link'}>AI Chat</NavLink>
        <NavLink to="/peek/profile" className={({ isActive }) => isActive ? 'peek-nav-link active' : 'peek-nav-link'}>Profile</NavLink>
        <NavLink to="/peek/connect" className={({ isActive }) => isActive ? 'peek-nav-link active' : 'peek-nav-link'}>Connect</NavLink>
      </div>
    </div>
  );
}

function Peek() {
  const navigate = useNavigate();

  return (
    <div className="auth-landing">
      <header className="auth-landing-header">
        <div className="auth-brand">
          <span className="auth-brand-badge">ARC</span>
          <span>HabytARC</span>
        </div>
        <div className="auth-header-actions">
          <button type="button" className="auth-link-btn" onClick={() => navigate('/login')}>
            Back to Login
          </button>
          <button type="button" className="auth-get-started-btn" onClick={() => navigate('/login')}>
            Get Started
          </button>
        </div>
      </header>

      <PeekNav />

      <div className="peek-preview-banner">
        Preview mode: explore all sections. Any action that changes data requires login.
      </div>

      <div className="peek-page-host">
        <Routes>
          <Route path="/" element={<Navigate to="/peek/home" replace />} />
          <Route path="/home" element={<Home user={previewUser} userData={previewUserData} isPreview />} />
          <Route path="/calendar" element={<Calendar user={previewUser} userData={previewUserData} isPreview />} />
          <Route path="/stats" element={<Stats user={previewUser} userData={previewUserData} isPreview />} />
          <Route path="/habits" element={<Habits user={previewUser} isPreview />} />
          <Route path="/todo" element={<Todo user={previewUser} isPreview />} />
          <Route path="/chat" element={<AIChat user={previewUser} userData={previewUserData} isPreview />} />
          <Route
            path="/profile"
            element={
              <Profile
                user={previewUser}
                userData={previewUserData}
                theme="dark"
                themeOptions={previewThemes}
                isPreview
              />
            }
          />
          <Route path="/connect" element={<Feedback isPreview />} />
        </Routes>
      </div>

      <footer className="auth-landing-footer">
        Preview is read-only. Login to start tracking habits.
      </footer>
    </div>
  );
}

export default Peek;
