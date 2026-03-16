import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle } from '../config/firebase';
import { createUserProfile, getUserProfile } from '../utils/firebaseService';

function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
          HabytARC brings habits, to-dos, exam mode, and AI-assisted study planning into one clean workspace with practical daily insights.
        </p>

        <div className="auth-hero-actions">
          <button type="button" className="auth-hero-peek" onClick={() => navigate('/peek')} disabled={loading}>
            Take a Peek
          </button>
          <button type="button" className="auth-hero-cta" onClick={handleGoogleSignIn} disabled={loading}>
            {loading ? 'Connecting Google...' : 'Launch My Habit Arc'}
            <span aria-hidden="true">→</span>
          </button>
          <span className="auth-hero-note">Google sign-in only. Setup takes less than a minute.</span>
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
            <h3>Exam Mode</h3>
            <p>Organize subjects, extract syllabus with AI, group units cleanly, and open study materials in one place.</p>
          </article>
          <article className="auth-landing-card">
            <span className="auth-card-label">Connect</span>
            <h3>AI + Feedback</h3>
            <p>Ask HabytARC AI for guidance and share anonymous feedback directly from inside the app.</p>
          </article>
        </section>
      </main>

      <footer className="auth-landing-footer">
        HabytARC - consistency that compounds.
      </footer>
    </div>
  );
}

export default Login;
