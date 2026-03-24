import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config/firebase';
import { createUserProfile, getUserProfile } from './utils/firebaseService';
import { ensurePushRegistration, ensureForegroundPushListener } from './utils/pushClient';
import { sendAppNotification } from './utils/notificationService';
import './styles/App.css';

import Login from './pages/Login';
import CareerSelection from './pages/CareerSelection';
import Home from './pages/Home';
import Calendar from './pages/Calendar';
import Stats from './pages/Stats';
import Habits from './pages/Habits';
import Profile from './pages/Profile';
import AIChat from './pages/AIChat';
import Todo from './pages/Todo';
import Peek from './pages/Peek';
import ExamMode from './pages/ExamMode';
import WorkspaceChoice from './pages/WorkspaceChoice';
import Navigation from './components/Navigation';

const THEME_OPTIONS = ['dark', 'light'];

function AppRoutes({ user, userData, theme, toggleTheme, refreshUserData, updateTheme }) {
  const location = useLocation();
  const inHabytarc = location.pathname.startsWith('/habytarc');
  const inZenvy = location.pathname.startsWith('/zenvy');
  const showNav = user && userData && !userData.needsCareerSelection && (inHabytarc || inZenvy);
  const appClassName = `app${inZenvy ? ' app-zenvy' : inHabytarc ? ' app-habytarc' : ' app-habytarc'}`;

  return (
    <div className={appClassName}>
      {showNav && (
        <Navigation
          theme={theme}
          onToggleTheme={toggleTheme}
          basePath={inZenvy ? '/zenvy' : '/habytarc'}
          appVariant={inZenvy ? 'zenvy' : 'habytarc'}
        />
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
              (userData.needsCareerSelection ? <Navigate to="/career-selection" /> : <WorkspaceChoice />) :
              <Navigate to="/login" />
          }
        />
        <Route path="/habytarc" element={<Navigate to="/habytarc/home" />} />
        <Route
          path="/habytarc/home"
          element={user && userData ? <Home user={user} userData={userData} /> : <Navigate to="/login" />}
        />
        <Route
          path="/habytarc/calendar"
          element={user && userData ? <Calendar user={user} userData={userData} /> : <Navigate to="/login" />}
        />
        <Route
          path="/habytarc/stats"
          element={user && userData ? <Stats user={user} userData={userData} /> : <Navigate to="/login" />}
        />
        <Route
          path="/habytarc/habits"
          element={user && userData ? <Habits user={user} /> : <Navigate to="/login" />}
        />
        <Route
          path="/habytarc/todo"
          element={
            user && userData ? (
              <Todo
                user={user}
                userData={userData}
                onProfileUpdated={refreshUserData}
              />
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/habytarc/chat"
          element={user && userData ? <AIChat user={user} userData={userData} /> : <Navigate to="/login" />}
        />
        <Route
          path="/habytarc/profile"
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
        <Route path="/zenvy" element={<Navigate to="/zenvy/exam-mode" />} />
        <Route
          path="/zenvy/exam-mode"
          element={user && userData ? <ExamMode user={user} /> : <Navigate to="/login" />}
        />
        <Route
          path="/zenvy/profile"
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
        <Route path="/home" element={<Navigate to="/habytarc/home" />} />
        <Route path="/calendar" element={<Navigate to="/habytarc/calendar" />} />
        <Route path="/stats" element={<Navigate to="/habytarc/stats" />} />
        <Route path="/habits" element={<Navigate to="/habytarc/habits" />} />
        <Route path="/todo" element={<Navigate to="/habytarc/todo" />} />
        <Route path="/chat" element={<Navigate to="/habytarc/chat" />} />
        <Route path="/habytarc/connect" element={<Navigate to="/habytarc/profile" replace />} />
        <Route path="/connect" element={<Navigate to="/habytarc/profile" replace />} />
        <Route path="/profile" element={<Navigate to="/habytarc/profile" />} />
        <Route path="/exam-mode" element={<Navigate to="/zenvy/exam-mode" />} />
        <Route path="/ikigai" element={<Navigate to="/habytarc/chat" />} />
      </Routes>
    </div>
  );
}

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

  useEffect(() => {
    if (!user?.uid) return;

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      ensurePushRegistration(user.uid).catch((error) => {
        console.error('Push registration sync failed:', error);
      });
    }

    ensureForegroundPushListener((payload) => {
      const title = payload?.notification?.title || payload?.data?.title || 'HabytARC';
      const body = payload?.notification?.body || payload?.data?.body || '';
      sendAppNotification(title, { body, tag: payload?.data?.tag || `fcm_${Date.now()}` }).catch(() => {});
    });
  }, [user?.uid]);

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
      <AppRoutes
        user={user}
        userData={userData}
        theme={theme}
        toggleTheme={toggleTheme}
        refreshUserData={refreshUserData}
        updateTheme={updateTheme}
      />
    </Router>
  );
}

export default App;
