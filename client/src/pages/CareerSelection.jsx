import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateUserProfile, createHabit } from '../utils/firebaseService';
import { getCareerHabits } from '../utils/careerHabits';

function CareerSelection({ user, onComplete }) {
  const [selectedCareer, setSelectedCareer] = useState('');
  const [cheatDay, setCheatDay] = useState('sunday');
  const [habitSetupMode, setHabitSetupMode] = useState('suggested');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const careers = [
    { id: 'student', name: 'Student', icon: '📚', description: 'Focus on learning' },
    { id: 'developer', name: 'Developer', icon: '💻', description: 'Code and build' },
    { id: 'fitness', name: 'Fitness', icon: '💪', description: 'Health focused' },
    { id: 'entrepreneur', name: 'Entrepreneur', icon: '🚀', description: 'Build business' },
    { id: 'creative', name: 'Creative', icon: '🎨', description: 'Art and design' },
    { id: 'general', name: 'General', icon: '⚡', description: 'Balanced life' }
  ];

  const handleContinue = async () => {
    if (!selectedCareer) return;
    setLoading(true);

    try {
      // Update user profile
      await updateUserProfile(user.uid, {
        career: selectedCareer,
        cheatDay,
        habitSetupMode,
        needsCareerSelection: false
      });

      // Create recommended habits only if user selects suggested setup.
      if (habitSetupMode === 'suggested') {
        const recommendedHabits = getCareerHabits(selectedCareer);
        await Promise.all(recommendedHabits.map((habit) => createHabit(user.uid, habit)));
      }

      await onComplete();
      navigate('/');
    } catch (err) {
      console.error('Error:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="career-selection-container">
      <div className="career-selection-card">
        <div className="career-header">
          <h1>Welcome! 👋</h1>
          <p>Let's personalize your journey</p>
        </div>

        <div className="career-step">
          <h2>Choose Your Path</h2>
          <p>Select what describes you best</p>
          
          <div className="career-grid">
            {careers.map((career) => (
              <div
                key={career.id}
                className={`career-card ${selectedCareer === career.id ? 'selected' : ''}`}
                onClick={() => setSelectedCareer(career.id)}
              >
                <div className="career-icon">{career.icon}</div>
                <h3>{career.name}</h3>
                <p>{career.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="career-step">
          <h2>Pick Your Cheat Day</h2>
          <p>One guilt-free rest day per week</p>
          
          <div className="cheat-day-selector">
            {['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((day) => (
              <button
                key={day}
                className={`day-button ${cheatDay === day ? 'selected' : ''}`}
                onClick={() => setCheatDay(day)}
              >
                {day.charAt(0).toUpperCase() + day.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="career-step">
          <h2>Habit Setup</h2>
          <p>Choose how you want to start</p>
          <div className="career-grid">
            <div
              className={`career-card ${habitSetupMode === 'suggested' ? 'selected' : ''}`}
              onClick={() => setHabitSetupMode('suggested')}
            >
              <div className="career-icon">✨</div>
              <h3>Suggested Habits</h3>
              <p>Start with recommended habits for your career</p>
            </div>
            <div
              className={`career-card ${habitSetupMode === 'manual' ? 'selected' : ''}`}
              onClick={() => setHabitSetupMode('manual')}
            >
              <div className="career-icon">✍️</div>
              <h3>Manual Setup</h3>
              <p>Start empty and add your own habits later</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
          <button
            className="btn btn-primary btn-large"
            onClick={handleContinue}
            disabled={!selectedCareer || loading}
          >
            {loading ? 'Setting up...' : 'Start My Journey'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CareerSelection;
