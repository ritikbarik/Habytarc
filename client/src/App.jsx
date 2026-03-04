import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config/firebase';
import { createUserProfile, getUserProfile } from './utils/firebaseService';
import './styles/App.css';

import Login from './pages/Login';
import CareerSelection from './pages/CareerSelection';
import Home from './pages/Home';
import Calendar from './pages/Calendar';
import Stats from './pages/Stats';
import Habits from './pages/Habits';
import Profile from './pages/Profile';
import AIChat from './pages/AIChat';
import Feedback from './pages/Feedback';
import Todo from './pages/Todo';
import Peek from './pages/Peek';
import Navigation from './components/Navigation';

const THEME_OPTIONS = ['dark', 'light'];

function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('habytarc_theme');
    if (THEME_OPTIONS.includes(savedTheme)) return savedTheme;
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('habytarc_theme', theme);
  }, [theme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          let profile = await getUserProfile(firebaseUser.uid);

          // Prevent auth/profile race: ensure every signed-in user has a profile.
          if (!profile) {
            await createUserProfile(firebaseUser.uid, {
              name: firebaseUser.displayName || 'User',
              email: firebaseUser.email || '',
              picture: firebaseUser.photoURL || '',
              needsCareerSelection: true,
              theme
            });
            profile = await getUserProfile(firebaseUser.uid);
          }

          if (profile?.theme && THEME_OPTIONS.includes(profile.theme)) {
            setTheme(profile.theme);
          }
          setUserData(profile);
        } catch (error) {
          console.error('Failed to load user profile:', error);
          setUserData(null);
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshUserData = async () => {
    if (user) {
      const profile = await getUserProfile(user.uid);
      if (profile?.theme && THEME_OPTIONS.includes(profile.theme)) {
        setTheme(profile.theme);
      }
      setUserData(profile);
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const updateTheme = (nextTheme) => {
    if (!THEME_OPTIONS.includes(nextTheme)) return;
    setTheme(nextTheme);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Initializing...</p>
      </div>
    );
  }

  return (
    <Router>
      <div className="app">
        {user && userData && !userData.needsCareerSelection && (
          <Navigation theme={theme} onToggleTheme={toggleTheme} />
        )}
        <Routes>
          <Route 
            path="/login" 
            element={user ? <Navigate to="/" /> : <Login />} 
          />
          <Route path="/peek/*" element={<Peek />} />
          <Route 
            path="/career-selection" 
            element={
              user && userData?.needsCareerSelection ? 
                <CareerSelection user={user} onComplete={refreshUserData} /> : 
                <Navigate to="/" />
            } 
          />
          <Route 
            path="/" 
            element={
              user && userData ? 
                (userData.needsCareerSelection ? <Navigate to="/career-selection" /> : <Home user={user} userData={userData} />) : 
                <Navigate to="/login" />
            } 
          />
          <Route 
            path="/calendar" 
            element={user && userData ? <Calendar user={user} userData={userData} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/stats" 
            element={user && userData ? <Stats user={user} userData={userData} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/habits" 
            element={user && userData ? <Habits user={user} /> : <Navigate to="/login" />} 
          />
          <Route
            path="/todo"
            element={user && userData ? <Todo user={user} /> : <Navigate to="/login" />}
          />
          <Route 
            path="/profile" 
            element={
              user && userData ? (
                <Profile
                  user={user}
                  userData={userData}
                  theme={theme}
                  themeOptions={THEME_OPTIONS}
                  onThemeChange={updateTheme}
                  onProfileUpdated={refreshUserData}
                />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/chat"
            element={user && userData ? <AIChat user={user} userData={userData} /> : <Navigate to="/login" />}
          />
          <Route
            path="/connect"
            element={user && userData ? <Feedback /> : <Navigate to="/login" />}
          />
          <Route
            path="/ikigai"
            element={<Navigate to="/chat" />}
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
