import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle } from '../config/firebase';
import { createUserProfile, getUserProfile } from '../utils/firebaseService';

const THEME_OPTIONS = ['dark', 'light'];

function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('habytarc_theme');
    if (THEME_OPTIONS.includes(savedTheme)) return savedTheme;
    return 'dark';
  });
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('habytarc_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const isDark = theme === 'dark';
  const themeIcon = isDark ? '☀' : '🌙';
  const themeAria = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await signInWithGoogle();
      const user = result.user;

      // Check if user profile exists
      let profile = await getUserProfile(user.uid);

      if (!profile) {
        // Create new user profile
        await createUserProfile(user.uid, {
          name: user.displayName,
          email: user.email,
          picture: user.photoURL,
          needsCareerSelection: true
        });
        navigate('/career-selection');
      } else {
        if (profile.needsCareerSelection) {
          navigate('/career-selection');
        } else {
          navigate('/');
        }
      }
    } catch (err) {
      console.error('Sign-in error:', err);
      setError(err.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-landing">
      <header className="auth-landing-header">
        <div className="auth-brand">
          <span className="auth-brand-badge">ARC</span>
          <span>HabytARC</span>
        </div>
        <div className="auth-header-actions">
          <button type="button" className="auth-link-btn" onClick={() => navigate('/peek')} disabled={loading}>
            Take a Peek
          </button>
          <button
            type="button"
            className="auth-theme-toggle"
            onClick={toggleTheme}
            aria-label={themeAria}
            title={themeAria}
            disabled={loading}
          >
            <span aria-hidden="true">{themeIcon}</span>
          </button>
          <button type="button" className="auth-get-started-btn" onClick={handleGoogleSignIn} disabled={loading}>
            {loading ? 'Getting Started...' : 'Get Started'}
          </button>
        </div>
      </header>

      <main className="auth-landing-main">
        <span className="auth-pill">Consistency with clarity</span>
        <h1 className="auth-landing-title">
          Plan Your Day
          <span> Track Habits Without Noise</span>
        </h1>
        <p className="auth-landing-subtitle">
          HabytARC now opens into two focused spaces after sign-in: HabytARC for habits and daily flow, and Zenvy for unit-wise exam progress and study planning.
        </p>

        <div className="auth-hero-actions">
          <button type="button" className="auth-hero-peek" onClick={() => navigate('/peek')} disabled={loading}>
            Take a Peek
          </button>
          <button type="button" className="auth-hero-cta" onClick={handleGoogleSignIn} disabled={loading}>
            {loading ? 'Connecting Google...' : 'Choose My Workspace'}
            <span aria-hidden="true">→</span>
          </button>
          <span className="auth-hero-note">Google sign-in only. After login, choose HabytARC or Zenvy.</span>
        </div>

        {error && <div className="error-message auth-landing-error">{error}</div>}

        <section className="auth-cards-grid">
          <article className="auth-landing-card">
            <span className="auth-card-label">Plan</span>
            <h3>Smart Habit Actions</h3>
            <p>Mark done, skip, or move habits to tomorrow/cheat day while keeping your schedule flexible.</p>
          </article>
          <article className="auth-landing-card">
            <span className="auth-card-label">Execute</span>
            <h3>Daily To-Do Flow</h3>
            <p>Capture priorities, due dates, and recurring tasks so daily execution stays simple.</p>
          </article>
          <article className="auth-landing-card">
            <span className="auth-card-label">Learn</span>
            <h3>Zenvy Workspace</h3>
            <p>Track subjects, extract syllabus with AI, group chapters by unit, and manage study materials in a dedicated exam workspace.</p>
          </article>
          <article className="auth-landing-card">
            <span className="auth-card-label">Connect</span>
            <h3>AI + Feedback</h3>
            <p>Ask HabytARC AI for guidance and share anonymous feedback directly from inside the app.</p>
          </article>
        </section>
      </main>

      <footer className="auth-landing-footer">
        HabytARC for daily momentum. Zenvy for exam clarity.
      </footer>
    </div>
  );
}

export default Login;
