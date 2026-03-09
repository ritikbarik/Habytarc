import React, { useState, useEffect, useMemo } from 'react';
import { subscribeToHabits, createHabit, updateHabit, deleteHabit, getTrackingHistory, getUserProfile } from '../utils/firebaseService';
import { getHabitStreakMap } from '../utils/dateUtils';
import TimeWheelPicker from '../components/TimeWheelPicker';

const previewHabits = [
  { id: 'p1', name: 'Morning Walk', category: 'Health', icon: '🚶', enabled: true, reminderEnabled: true, reminderTime: '07:30' },
  { id: 'p2', name: 'Deep Work Sprint', category: 'Work', icon: '💻', enabled: true },
  { id: 'p3', name: 'Read 20 mins', category: 'Learning', icon: '📚', enabled: true }
];

function Habits({ user, isPreview = false }) {
  const [habits, setHabits] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [trackingHistory, setTrackingHistory] = useState({});
  const [cheatDay, setCheatDay] = useState('sunday');
  const [reminderDrafts, setReminderDrafts] = useState({});
  const [newHabit, setNewHabit] = useState({
    name: '',
    category: 'Work',
    icon: '⭐',
    reminderEnabled: false,
    reminderTime: ''
  });

  const categories = ['Work', 'Health', 'Learning', 'Lifestyle', 'Social'];
  const icons = ['⭐', '💼', '💪', '📚', '🎯', '🏃', '🧘', '💻', '🎨', '🍎', '☕', '🚀', '🔥', '⚡', '🌟'];

  useEffect(() => {
    if (isPreview) {
      setHabits(previewHabits);
      setTrackingHistory({
        [new Date().toISOString().slice(0, 10)]: { p1: true, p2: true, p3: false }
      });
      setCheatDay('sunday');
      setLoading(false);
      return () => {};
    }

    const unsubscribe = subscribeToHabits(user.uid, (fetchedHabits) => {
      setHabits(fetchedHabits);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isPreview, user?.uid]);

  useEffect(() => {
    if (isPreview) return;
    const loadMeta = async () => {
      try {
        const [history, profile] = await Promise.all([
          getTrackingHistory(user.uid),
          getUserProfile(user.uid)
        ]);
        setTrackingHistory(history);
        setCheatDay(profile?.cheatDay || 'sunday');
      } catch (error) {
        console.error('Failed to load streak metadata:', error);
      }
    };

    loadMeta();
  }, [isPreview, user?.uid]);

  const streakMap = useMemo(
    () => getHabitStreakMap(habits, trackingHistory, cheatDay),
    [habits, trackingHistory, cheatDay]
  );

  useEffect(() => {
    const nextDrafts = {};
    habits.forEach((habit) => {
      nextDrafts[habit.id] = String(habit.reminderTime || '');
    });
    setReminderDrafts(nextDrafts);
  }, [habits]);

  const requestReminderPermissionIfNeeded = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (error) {
      return false;
    }
  };

  const handleAddHabit = async (e) => {
    e.preventDefault();
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    setSubmitting(true);

    try {
      const reminderTime = String(newHabit.reminderTime || '');
      const reminderEnabled = Boolean(newHabit.reminderEnabled && reminderTime);
      if (reminderEnabled) {
        await requestReminderPermissionIfNeeded();
      }

      await createHabit(user.uid, {
        name: newHabit.name,
        category: newHabit.category,
        icon: newHabit.icon,
        reminderEnabled,
        reminderTime: reminderEnabled ? reminderTime : ''
      });
      setNewHabit({ name: '', category: 'Work', icon: '⭐', reminderEnabled: false, reminderTime: '' });
      setShowAddForm(false);
    } catch (err) {
      console.error('Error:', err);
      alert('Failed to add habit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const saveHabitReminder = async (habit, nextTime) => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    const cleanedTime = String(nextTime || '').trim();
    const reminderEnabled = Boolean(cleanedTime);
    if (reminderEnabled) {
      const granted = await requestReminderPermissionIfNeeded();
      if (!granted) {
        alert('Browser notification permission is not granted. Enable it in browser settings to receive reminders.');
      }
    }
    try {
      await updateHabit(habit.id, {
        reminderEnabled,
        reminderTime: reminderEnabled ? cleanedTime : ''
      });
    } catch (error) {
      console.error('Failed to save reminder:', error);
      alert('Failed to save habit reminder.');
      setReminderDrafts((prev) => ({ ...prev, [habit.id]: String(habit.reminderTime || '') }));
    }
  };

  const toggleHabit = async (habitId, currentState) => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    // Optimistic update
    setHabits(habits.map(h => 
      h.id === habitId ? { ...h, enabled: !currentState } : h
    ));

    try {
      await updateHabit(habitId, { enabled: !currentState });
    } catch (err) {
      console.error('Error:', err);
      // Revert on error
      setHabits(habits.map(h => 
        h.id === habitId ? { ...h, enabled: currentState } : h
      ));
    }
  };

  const handleDeleteHabit = async (habitId) => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    if (!window.confirm('Delete this habit? Tracking data will be kept.')) return;

    // Optimistic delete
    const habitToDelete = habits.find(h => h.id === habitId);
    setHabits(habits.filter(h => h.id !== habitId));

    try {
      await deleteHabit(habitId);
    } catch (err) {
      console.error('Error:', err);
      // Revert on error
      setHabits([...habits, habitToDelete]);
      alert('Failed to delete habit');
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Loading habits...</p>
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
            <h1>Manage Habits</h1>
            <p className="page-subtitle">Add or customize your habits</p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (isPreview) {
                alert('Login to continue');
                return;
              }
              setShowAddForm(true);
            }}
          >
            + Add Habit
          </button>
        </div>

        {showAddForm && (
          <div className="modal-overlay" onClick={() => !submitting && setShowAddForm(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Add New Habit</h2>
                <button 
                  className="modal-close" 
                  onClick={() => setShowAddForm(false)}
                  disabled={submitting}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddHabit} className="auth-form">
                <div className="form-group">
                  <label>Habit Name</label>
                  <input
                    type="text"
                    value={newHabit.name}
                    onChange={(e) => setNewHabit({ ...newHabit, name: e.target.value })}
                    placeholder="e.g., Exercise 30 minutes"
                    required
                    disabled={submitting}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={newHabit.category}
                    onChange={(e) => setNewHabit({ ...newHabit, category: e.target.value })}
                    disabled={submitting}
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Icon</label>
                  <div className="icon-picker">
                    {icons.map(icon => (
                      <button
                        key={icon}
                        type="button"
                        className={`icon-option ${newHabit.icon === icon ? 'selected' : ''}`}
                        onClick={() => setNewHabit({ ...newHabit, icon })}
                        disabled={submitting}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Daily Reminder (Optional)</label>
                  <div className="habit-reminder-builder">
                    <label className="habit-reminder-toggle">
                      <input
                        type="checkbox"
                        checked={newHabit.reminderEnabled}
                        onChange={(e) => setNewHabit({ ...newHabit, reminderEnabled: e.target.checked })}
                        disabled={submitting}
                      />
                      <span>Enable browser reminder</span>
                    </label>
                    <TimeWheelPicker
                      value={newHabit.reminderTime}
                      onChange={(value) => setNewHabit({ ...newHabit, reminderTime: value })}
                      disabled={submitting || !newHabit.reminderEnabled}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setShowAddForm(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Adding...' : 'Add Habit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="habits-list">
          {habits.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>No habits yet</h3>
              <p>Click "Add Habit" to create your first habit</p>
            </div>
          ) : (
            habits.map((habit) => (
              <div 
                key={habit.id} 
                className="habit-item" 
                style={{ opacity: habit.enabled ? 1 : 0.5 }}
              >
                <div className="habit-content">
                  <div className="habit-icon">{habit.icon}</div>
                  <div className="habit-details">
                    <h3>{habit.name}</h3>
                    <span className="habit-category">{habit.category} • Streak {streakMap[habit.id] || 0}d</span>
                    <div className="habit-reminder-row">
                      <span className="habit-reminder-label">
                        Reminder: {habit.reminderEnabled && habit.reminderTime ? habit.reminderTime : 'Off'}
                      </span>
                      <TimeWheelPicker
                        value={reminderDrafts[habit.id] ?? String(habit.reminderTime || '')}
                        onChange={(value) => {
                          setReminderDrafts((prev) => ({ ...prev, [habit.id]: value }));
                          saveHabitReminder(habit, value);
                        }}
                        disabled={isPreview}
                        className="habit-reminder-input"
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setReminderDrafts((prev) => ({ ...prev, [habit.id]: '' }));
                          saveHabitReminder(habit, '');
                        }}
                        disabled={isPreview}
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className={habit.enabled ? 'btn btn-secondary' : 'btn btn-primary'}
                    onClick={() => toggleHabit(habit.id, habit.enabled)}
                    style={{ padding: '0.5rem 0.875rem', fontSize: '0.875rem' }}
                  >
                    {habit.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleDeleteHabit(habit.id)}
                    style={{ padding: '0.5rem 0.875rem', fontSize: '0.875rem' }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {habits.length > 0 && (
          <div style={{ 
            marginTop: '2rem', 
            padding: '1rem', 
            background: 'var(--bg-primary)', 
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center',
            color: 'var(--text-secondary)'
          }}>
            <p>💡 <strong>Tip:</strong> Disabled habits won't show on your home page but data is preserved</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Habits;
