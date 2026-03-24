import React, { useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Home from './Home';
import Calendar from './Calendar';
import Stats from './Stats';
import Habits from './Habits';
import Todo from './Todo';
import AIChat from './AIChat';
import Profile from './Profile';
import Navigation from '../components/Navigation';

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

function Peek() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState('dark');

  return (
    <div className="app peek-app">
      <Navigation
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        basePath="/peek"
      />

      <div className="page-container" style={{ paddingTop: '0.8rem' }}>
        <div className="page-content">
          <div className="peek-preview-banner">
            Preview mode: explore all sections. Any action that changes data requires login.
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginLeft: '0.75rem', padding: '0.35rem 0.65rem' }}
              onClick={() => navigate('/login')}
            >
              Get Started
            </button>
          </div>
        </div>
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
                theme={theme}
                themeOptions={previewThemes}
                isPreview
              />
            }
          />
        </Routes>
      </div>
    </div>
  );
}

export default Peek;
