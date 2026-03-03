// Career-based habit recommendations (AI logic - rule-based for MVP)

export const getCareerHabits = (career) => {
  const habitSets = {
    student: [
      { name: 'Study for 2 hours', category: 'Learning', icon: '📖' },
      { name: 'Review notes', category: 'Learning', icon: '📝' },
      { name: 'Exercise 15 minutes', category: 'Health', icon: '🏃' },
      { name: 'Read for 30 minutes', category: 'Learning', icon: '📚' },
      { name: 'Practice problem-solving', category: 'Learning', icon: '🧩' }
    ],
    developer: [
      { name: 'Code for 2 hours', category: 'Work', icon: '💻' },
      { name: 'Learn new technology', category: 'Learning', icon: '🔧' },
      { name: 'Review pull requests', category: 'Work', icon: '👀' },
      { name: 'Exercise 20 minutes', category: 'Health', icon: '🏋️' },
      { name: 'Work on side project', category: 'Work', icon: '🚀' }
    ],
    fitness: [
      { name: 'Morning workout 45 min', category: 'Health', icon: '💪' },
      { name: 'Track calories', category: 'Health', icon: '🍎' },
      { name: 'Drink 8 glasses of water', category: 'Health', icon: '💧' },
      { name: 'Stretch for 10 minutes', category: 'Health', icon: '🧘' },
      { name: 'Get 8 hours sleep', category: 'Health', icon: '😴' }
    ],
    entrepreneur: [
      { name: 'Work on business 3 hours', category: 'Work', icon: '💼' },
      { name: 'Network with 1 person', category: 'Work', icon: '🤝' },
      { name: 'Learn marketing/sales', category: 'Learning', icon: '📊' },
      { name: 'Review financials', category: 'Work', icon: '💰' },
      { name: 'Exercise 30 minutes', category: 'Health', icon: '🏃' }
    ],
    creative: [
      { name: 'Create for 2 hours', category: 'Work', icon: '🎨' },
      { name: 'Study inspiration', category: 'Learning', icon: '👁️' },
      { name: 'Practice fundamentals', category: 'Work', icon: '✏️' },
      { name: 'Share your work', category: 'Work', icon: '📤' },
      { name: 'Take a creative walk', category: 'Health', icon: '🚶' }
    ],
    general: [
      { name: 'Morning routine 30 min', category: 'Lifestyle', icon: '🌅' },
      { name: 'Work focused 2 hours', category: 'Work', icon: '⚡' },
      { name: 'Exercise 30 minutes', category: 'Health', icon: '🏃' },
      { name: 'Read for 20 minutes', category: 'Learning', icon: '📖' },
      { name: 'Reflect and journal', category: 'Lifestyle', icon: '📔' }
    ]
  };

  return habitSets[career] || habitSets.general;
};

export const getCareerInfo = (career) => {
  const careerInfo = {
    student: { name: 'Student', color: '#3b82f6' },
    developer: { name: 'Developer', color: '#8b5cf6' },
    fitness: { name: 'Fitness Enthusiast', color: '#ef4444' },
    entrepreneur: { name: 'Entrepreneur', color: '#f59e0b' },
    creative: { name: 'Creative Professional', color: '#ec4899' },
    general: { name: 'General Productivity', color: '#10b981' }
  };

  return careerInfo[career] || careerInfo.general;
};
