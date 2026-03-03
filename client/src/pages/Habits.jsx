import React, { useState, useEffect } from 'react';
import { subscribeToHabits, createHabit, updateHabit, deleteHabit } from '../utils/firebaseService';

function Habits({ user }) {
  const [habits, setHabits] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newHabit, setNewHabit] = useState({
    name: '',
    category: 'Work',
    icon: '⭐'
  });

  const categories = ['Work', 'Health', 'Learning', 'Lifestyle', 'Social'];
  const icons = ['⭐', '💼', '💪', '📚', '🎯', '🏃', '🧘', '💻', '🎨', '🍎', '☕', '🚀', '🔥', '⚡', '🌟'];

  useEffect(() => {
    const unsubscribe = subscribeToHabits(user.uid, (fetchedHabits) => {
      setHabits(fetchedHabits);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.uid]);

  const handleAddHabit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await createHabit(user.uid, newHabit);
      setNewHabit({ name: '', category: 'Work', icon: '⭐' });
      setShowAddForm(false);
    } catch (err) {
      console.error('Error:', err);
      alert('Failed to add habit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleHabit = async (habitId, currentState) => {
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
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
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
                    <span className="habit-category">{habit.category}</span>
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
