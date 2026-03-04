import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOutUser } from '../config/firebase';
import { getUserHabits, getTrackingHistory, updateUserProfile } from '../utils/firebaseService';
import { getCareerInfo } from '../utils/careerHabits';

function Profile({ user, userData, theme, themeOptions = [], onThemeChange, onProfileUpdated, isPreview = false }) {
  const [stats, setStats] = useState({ totalHabits: 0, totalDays: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    picture: '',
    career: 'general',
    cheatDay: 'sunday',
    theme: 'dark'
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (isPreview) {
      setStats({ totalHabits: 4, totalDays: 28 });
      setLoading(false);
      return;
    }
    loadStats();
  }, [isPreview, user?.uid]);

  useEffect(() => {
    setProfileForm({
      name: userData?.name || user.displayName || '',
      picture: userData?.picture || '',
      career: userData?.career || 'general',
      cheatDay: userData?.cheatDay || 'sunday',
      theme: userData?.theme || theme || 'dark'
    });
  }, [userData, user.displayName, user.email, theme]);

  const loadStats = async () => {
    try {
      const [habits, history] = await Promise.all([
        getUserHabits(user.uid),
        getTrackingHistory(user.uid)
      ]);

      setStats({
        totalHabits: habits.length,
        totalDays: Object.keys(history).length
      });
    } catch (error) {
      console.error('Error loading profile stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    if (!window.confirm('Are you sure you want to log out?')) return;

    try {
      await signOutUser();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
      alert('Failed to log out. Please try again.');
    }
  };

  const handleProfileChange = (field, value) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleProfileImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert('Image is too large. Please choose a file smaller than 8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const sourceData = typeof reader.result === 'string' ? reader.result : '';
      if (!sourceData) {
        alert('Failed to load selected image.');
        return;
      }

      const img = new Image();
      img.onload = () => {
        const maxSize = 320;
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const width = Math.max(Math.round(img.width * scale), 1);
        const height = Math.max(Math.round(img.height * scale), 1);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          alert('Failed to process selected image.');
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.8);

        if (compressed.length > 850000) {
          alert('Image is still too large after compression. Please choose a smaller image.');
          return;
        }

        handleProfileChange('picture', compressed);
      };
      img.onerror = () => {
        alert('Failed to process selected image.');
      };
      img.src = sourceData;
    };
    reader.onerror = () => {
      alert('Failed to load selected image.');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    setSaving(true);

    try {
      await updateUserProfile(user.uid, {
        name: profileForm.name.trim(),
        picture: profileForm.picture.trim(),
        career: profileForm.career,
        cheatDay: profileForm.cheatDay,
        theme: profileForm.theme
      });

      if (onThemeChange) {
        onThemeChange(profileForm.theme);
      }

      if (onProfileUpdated) {
        await onProfileUpdated();
      }
      setShowEditForm(false);
      alert('Profile updated successfully.');
    } catch (error) {
      console.error('Error updating profile:', error);
      const details = error?.code ? ` (${error.code})` : '';
      alert(`Failed to update profile${details}. Please try again.`);
    } finally {
      setSaving(false);
    }
  };

  const careerInfo = getCareerInfo(profileForm.career || 'general');
  const memberSince = userData?.createdAt 
    ? new Date(userData.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Recently';

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>Profile</h1>
            <p className="page-subtitle">Your habit journey</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowEditForm((prev) => !prev)}
            >
              {showEditForm ? 'Hide Edit' : 'Edit Profile'}
            </button>
            <button className="btn btn-secondary" onClick={handleLogout}>
              {isPreview ? 'Login to Continue' : 'Log Out'}
            </button>
          </div>
        </div>

        {isPreview && (
          <div className="chart-container" style={{ marginBottom: '1rem', borderColor: 'var(--primary)' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Preview mode is read-only. Login to save profile or apply settings.</p>
          </div>
        )}

        <div className="profile-card">
          {profileForm.picture ? (
            <img 
              src={profileForm.picture} 
              alt={profileForm.name || 'Profile'}
              style={{ 
                width: '80px', 
                height: '80px', 
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0
              }}
            />
          ) : (
            <div className="profile-avatar">
              {profileForm.name?.charAt(0).toUpperCase() || user.displayName?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
          <div className="profile-info">
            <h2>{profileForm.name || user.displayName || 'User'}</h2>
            <p className="profile-email">{profileForm.email || user.email}</p>
            <div className="profile-badges">
              <span className="badge">{careerInfo.name}</span>
              <span className="badge">Member since {memberSince}</span>
              <span className="badge">Cloud Synced ☁️</span>
            </div>
          </div>
        </div>

        {showEditForm && (
          <div style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)'
          }}>
            <h2 style={{ marginBottom: '1rem' }}>Edit Profile</h2>
            <form onSubmit={handleSaveProfile} className="auth-form">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => handleProfileChange('name', e.target.value)}
                  placeholder="Enter your name"
                  required
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label>Profile Image URL</label>
                <input
                  type="url"
                  value={profileForm.picture}
                  onChange={(e) => handleProfileChange('picture', e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label>Upload Profile Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProfileImageUpload}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label>Career</label>
                <select
                  value={profileForm.career}
                  onChange={(e) => handleProfileChange('career', e.target.value)}
                  disabled={saving}
                >
                  <option value="student">Student</option>
                  <option value="developer">Developer</option>
                  <option value="fitness">Fitness</option>
                  <option value="entrepreneur">Entrepreneur</option>
                  <option value="creative">Creative</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div className="form-group">
                <label>Cheat Day</label>
                <select
                  value={profileForm.cheatDay}
                  onChange={(e) => handleProfileChange('cheatDay', e.target.value)}
                  disabled={saving}
                >
                  <option value="sunday">Sunday</option>
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                  <option value="saturday">Saturday</option>
                </select>
              </div>

              <div className="form-group">
                <label>App Theme</label>
                <select
                  value={profileForm.theme}
                  onChange={(e) => handleProfileChange('theme', e.target.value)}
                  disabled={saving}
                >
                  {themeOptions.map((item) => (
                    <option key={item} value={item}>
                      {item.charAt(0).toUpperCase() + item.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Days Tracked</div>
            <div className="stat-value">{stats.totalDays}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Habits</div>
            <div className="stat-value">{stats.totalHabits}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Cheat Day</div>
            <div className="stat-value" style={{ fontSize: '1.25rem', textTransform: 'capitalize' }}>
              {profileForm.cheatDay || 'Sunday'}
            </div>
          </div>
        </div>

        <div style={{ 
          marginTop: '2rem',
          padding: '1.5rem',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'center'
        }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            🌱 Keep building your habits consistently
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Your data is automatically backed up to the cloud
          </p>
        </div>
      </div>
    </div>
  );
}

export default Profile;
