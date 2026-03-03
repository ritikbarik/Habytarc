import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { subscribeToHabits, getTrackingForDate, saveTracking } from '../utils/firebaseService';
import { isCheatDay, getDateString, getTodayProgress } from '../utils/dateUtils';

const refreshQuotes = [
  'You do not rise to the level of your goals. You fall to the level of your systems.',
  'Every action you take is a vote for the type of person you wish to become.',
  'Success is the product of daily habits, not once-in-a-lifetime transformations.',
  'Habits are the compound interest of self-improvement.',
  'You should be far more concerned with your current trajectory than with your current results.',
  'Make it obvious. Make it attractive. Make it easy. Make it satisfying.',
  'Professionals stick to the schedule; amateurs let life get in the way.',
  'The purpose of setting goals is to win the game. The purpose of building systems is to continue playing.'
];

const getGreetingByTime = (name) => {
  const hour = new Date().getHours();
  const safeName = name || 'there';

  if (hour < 12) return `Good morning, ${safeName}`;
  if (hour < 17) return `Good afternoon, ${safeName}`;
  return `Good evening, ${safeName}`;
};

const getRefreshQuote = () => {
  const index = Math.floor(Math.random() * refreshQuotes.length);
  return refreshQuotes[index];
};

function Home({ user, userData }) {
  const [habits, setHabits] = useState([]);
  const [todayTracking, setTodayTracking] = useState({});
  const [isCheat, setIsCheat] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quote] = useState(() => getRefreshQuote());

  useEffect(() => {
    let unsubscribe = null;

    const loadData = async () => {
      try {
        // Subscribe to habits (real-time)
        unsubscribe = subscribeToHabits(user.uid, (fetchedHabits) => {
          const enabledHabits = fetchedHabits.filter(h => h.enabled !== false);
          setHabits(enabledHabits);
          setLoading(false);
        });

        // Load today's tracking
        const today = getDateString();
        const tracking = await getTrackingForDate(user.uid, today);
        setTodayTracking(tracking);

        // Check cheat day
        const cheat = userData?.cheatDay ? isCheatDay(userData.cheatDay) : false;
        setIsCheat(cheat);
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };

    loadData();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user.uid, userData?.cheatDay]);

  const toggleHabit = async (habitId) => {
    if (isCheat) return;

    const today = getDateString();
    const newValue = !todayTracking[habitId];

    // Optimistic update
    setTodayTracking(prev => ({ ...prev, [habitId]: newValue }));

    try {
      await saveTracking(user.uid, today, habitId, newValue);
    } catch (err) {
      console.error('Error saving:', err);
      const code = err?.code ? ` (${err.code})` : '';
      alert(`Failed to update habit${code}. Check Firestore rules and try again.`);
      // Revert on error
      setTodayTracking(prev => ({ ...prev, [habitId]: !newValue }));
    }
  };

  const progress = habits.length > 0 ? getTodayProgress(habits, todayTracking) : 0;
  const completedCount = habits.filter(habit => todayTracking[habit.id]).length;
  const greeting = getGreetingByTime(userData?.name || user?.displayName);

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Loading your habits...</p>
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
            <h1>Today's Habits</h1>
            <p className="page-subtitle">
              {isCheat ? (
                <span className="cheat-day-badge">🎉 Cheat Day - Rest & Recharge</span>
              ) : (
                <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
              )}
            </p>
          </div>
        </div>

        <div style={{
          marginBottom: '1rem',
          padding: '1rem 1.25rem',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)'
        }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.35rem' }}>{greeting} 👋</h2>
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            "{quote}"
          </p>
        </div>

        {!isCheat && habits.length > 0 && (
          <div className="progress-summary">
            <div className="progress-info">
              <h2>{completedCount} of {habits.length} completed</h2>
              <p>{habits.length - completedCount} remaining</p>
            </div>
            <div className="progress-circle">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" className="progress-bg" />
                <circle 
                  cx="50" 
                  cy="50" 
                  r="45" 
                  className="progress-fill"
                  style={{
                    strokeDasharray: `${progress * 2.827} 282.7`,
                    transform: 'rotate(-90deg)',
                    transformOrigin: '50% 50%'
                  }}
                />
                <text x="50" y="50" className="progress-text">{Math.round(progress)}%</text>
              </svg>
            </div>
          </div>
        )}

        {isCheat ? (
          <div className="cheat-day-message">
            <div className="cheat-day-icon">🌴</div>
            <h2>Rest Day</h2>
            <p>Your streaks are safe. Relax!</p>
          </div>
        ) : (
          <div className="habits-list">
            {habits.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <h3>No habits yet</h3>
                <p>Add habits from the Habits page to get started</p>
                <a href="/habits" className="btn btn-primary" style={{ marginTop: '1rem', textDecoration: 'none' }}>
                  Add Your First Habit
                </a>
              </div>
            ) : (
              habits.map((habit) => (
                <div
                  key={habit.id}
                  className={`habit-item ${todayTracking[habit.id] ? 'completed' : ''}`}
                  onClick={() => toggleHabit(habit.id)}
                >
                  <div className="habit-checkbox">
                    {todayTracking[habit.id] && <span className="checkmark">✓</span>}
                  </div>
                  <div className="habit-content">
                    <div className="habit-icon">{habit.icon}</div>
                    <div className="habit-details">
                      <h3>{habit.name}</h3>
                      <span className="habit-category">{habit.category}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <Link to="/chat" className="home-ai-fab" aria-label="Open HabytARC AI">
        AI
      </Link>
    </div>
  );
}

export default Home;
