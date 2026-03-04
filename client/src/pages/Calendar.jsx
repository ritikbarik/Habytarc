import React, { useState, useEffect } from 'react';
import { getPendingTasksForDate, getUserHabits, subscribeToTracking, saveTracking } from '../utils/firebaseService';
import { getDateString, isCheatDayForDate } from '../utils/dateUtils';

const previewHabits = [
  { id: 'p1', name: 'Morning Walk', category: 'Health', icon: '🚶', enabled: true },
  { id: 'p2', name: 'Deep Work Sprint', category: 'Work', icon: '💻', enabled: true },
  { id: 'p3', name: 'Read 20 mins', category: 'Learning', icon: '📚', enabled: true }
];

function Calendar({ user, userData, isPreview = false }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [habits, setHabits] = useState([]);
  const [tracking, setTracking] = useState({});
  const [selectedDayHabits, setSelectedDayHabits] = useState([]);
  const [selectedIsCheat, setSelectedIsCheat] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isPreview) {
      const today = new Date();
      const d1 = getDateString(today);
      const d2 = getDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
      const d3 = getDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2));
      setHabits(previewHabits);
      setTracking({
        [d1]: { p1: true, p2: true, p3: false },
        [d2]: { p1: true, p2: false, p3: true },
        [d3]: { p1: true, p2: true, p3: true }
      });
      setLoading(false);
      return () => {};
    }

    let unsubscribeTracking = null;

    const loadData = async () => {
      try {
        // Load habits
        const fetchedHabits = await getUserHabits(user.uid);
        const enabledHabits = fetchedHabits.filter(h => h.enabled !== false);
        setHabits(enabledHabits);

        // Subscribe to tracking updates
        unsubscribeTracking = subscribeToTracking(user.uid, (trackingData) => {
          setTracking(trackingData);
          setLoading(false);
        });
      } catch (error) {
        console.error('Error loading calendar:', error);
        setLoading(false);
      }
    };

    loadData();

    return () => {
      if (unsubscribeTracking) unsubscribeTracking();
    };
  }, [isPreview, user?.uid]);

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDate(null);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDate(null);
  };

  const handleDateClick = async (day) => {
    const clickedDate = new Date(year, month, day);
    setSelectedDate(clickedDate);
    
    const dateStr = getDateString(clickedDate);
    const dayTracking = tracking[dateStr] || {};
    const cheatDay = String(userData?.cheatDay || 'sunday').toLowerCase();
    const isCheat = isCheatDayForDate(clickedDate, cheatDay);
    setSelectedIsCheat(isCheat);

    if (isCheat) {
      if (isPreview) {
        const movedPreview = [
          {
            id: 'preview-moved-1',
            habitId: 'p3',
            habitName: 'Read 20 mins',
            dueDate: dateStr,
            status: 'pending'
          }
        ];
        const movedHabits = movedPreview
          .filter((task) => task.dueDate === dateStr)
          .map((task) => {
            const original = habits.find((habit) => habit.id === task.habitId);
            return {
              id: task.habitId,
              name: task.habitName || original?.name || 'Moved Habit',
              category: original?.category || 'Moved',
              icon: original?.icon || '⏩',
              completed: Boolean(dayTracking[task.habitId])
            };
          });
        setSelectedDayHabits(movedHabits);
        return;
      }

      try {
        const movedTasks = await getPendingTasksForDate(user.uid, dateStr);
        const movedHabits = movedTasks.map((task) => {
          const original = habits.find((habit) => habit.id === task.habitId);
          return {
            id: task.habitId,
            name: task.habitName || original?.name || 'Moved Habit',
            category: original?.category || 'Moved',
            icon: original?.icon || '⏩',
            completed: Boolean(dayTracking[task.habitId])
          };
        });
        setSelectedDayHabits(movedHabits);
      } catch (error) {
        console.error('Failed to load moved habits for cheat day:', error);
        setSelectedDayHabits([]);
      }
      return;
    }

    const habitsWithStatus = habits.map((habit) => ({
      ...habit,
      completed: dayTracking[habit.id] || false
    }));

    setSelectedDayHabits(habitsWithStatus);
  };

  const toggleHabitForDate = async (habitId) => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    if (!selectedDate) return;

    const dateStr = getDateString(selectedDate);
    const currentValue = tracking[dateStr]?.[habitId] || false;
    
    // Optimistic update
    const updatedHabits = selectedDayHabits.map(h =>
      h.id === habitId ? { ...h, completed: !currentValue } : h
    );
    setSelectedDayHabits(updatedHabits);

    try {
      await saveTracking(user.uid, dateStr, habitId, !currentValue);
    } catch (err) {
      console.error('Error:', err);
      // Revert on error
      setSelectedDayHabits(selectedDayHabits.map(h =>
        h.id === habitId ? { ...h, completed: currentValue } : h
      ));
    }
  };

  const getDateStatus = (day) => {
    const dateStr = getDateString(new Date(year, month, day));
    const dayTracking = tracking[dateStr];
    
    if (!dayTracking || habits.length === 0) return 'empty';

    const enabledHabitIds = new Set(habits.map((habit) => habit.id));
    const completed = Object.entries(dayTracking).filter(
      ([habitId, isDone]) => enabledHabitIds.has(habitId) && isDone
    ).length;
    const total = habits.length;
    
    if (completed === 0) return 'empty';
    if (completed === total) return 'complete';
    return 'partial';
  };

  const isToday = (day) => {
    const today = new Date();
    return day === today.getDate() && 
           month === today.getMonth() && 
           year === today.getFullYear();
  };

  const renderCalendarDays = () => {
    const days = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const status = getDateStatus(day);
      const today = isToday(day);
      
      days.push(
        <div
          key={day}
          className={`calendar-day ${status} ${today ? 'today' : ''} ${selectedDate && selectedDate.getDate() === day && selectedDate.getMonth() === month ? 'selected' : ''}`}
          onClick={() => handleDateClick(day)}
        >
          <div className="day-number">{day}</div>
          {status !== 'empty' && (
            <div className="day-indicator"></div>
          )}
        </div>
      );
    }
    
    return days;
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Loading calendar...</p>
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
            <h1>Calendar</h1>
            <p className="page-subtitle">Track habits over time</p>
          </div>
        </div>

        <div className="calendar-container">
          <div className="calendar-header">
            <button className="btn btn-secondary" onClick={previousMonth}>◀</button>
            <h2>{monthNames[month]} {year}</h2>
            <button className="btn btn-secondary" onClick={nextMonth}>▶</button>
          </div>

          <div className="calendar-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="weekday">{day}</div>
            ))}
          </div>

          <div className="calendar-grid">
            {renderCalendarDays()}
          </div>

          <div className="calendar-legend">
            <div className="legend-item">
              <div className="legend-dot empty"></div>
              <span>No data</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot partial"></div>
              <span>Partial</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot complete"></div>
              <span>Complete</span>
            </div>
          </div>
        </div>

        {selectedDate && (
          <div className="selected-day-panel">
            <h3>
              {selectedDate.toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric',
                year: 'numeric'
              })}
            </h3>
            
            {selectedDayHabits.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>
                {selectedIsCheat
                  ? 'Cheat day: no regular habits. Only habits moved to this day are shown.'
                  : 'No habits for this date'}
              </p>
            ) : (
              <div className="habits-list" style={{ marginTop: '1rem' }}>
                {selectedDayHabits.map((habit) => (
                  <div
                    key={habit.id}
                    className={`habit-item ${habit.completed ? 'completed' : ''}`}
                    onClick={() => toggleHabitForDate(habit.id)}
                  >
                    <div className="habit-checkbox">
                      {habit.completed && <span className="checkmark">✓</span>}
                    </div>
                    <div className="habit-content">
                      <div className="habit-icon">{habit.icon}</div>
                      <div className="habit-details">
                        <h3>{habit.name}</h3>
                        <span className="habit-category">{habit.category}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Calendar;
