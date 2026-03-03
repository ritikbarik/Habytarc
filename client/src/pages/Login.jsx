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
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="app-logo">HabytARC</h1>
          <p className="auth-subtitle">Build sustainable habits with cloud sync</p>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2rem' }}>
          <button 
            className="btn btn-primary btn-large"
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}
          >
            <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="none" d="M0 0h48v48H0z"/>
            </svg>
            {loading ? 'Signing in...' : 'Sign in with Google'}
          </button>
          
          <div style={{ 
            textAlign: 'center', 
            color: 'var(--text-secondary)', 
            fontSize: '0.875rem',
            padding: '0 1rem'
          }}>
            <p>✨ Secure sign-in with your Google account</p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>
              All your data syncs automatically across devices
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
