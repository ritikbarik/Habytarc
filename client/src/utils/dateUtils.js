// Date and tracking utilities

export const getDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  return next;
};

export const getDateAfterDays = (days, fromDate = new Date()) => getDateString(addDays(fromDate, days));

export const isCheatDay = (cheatDay) => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = new Date().getDay();
  return days[today] === cheatDay.toLowerCase();
};

export const getTodayProgress = (habits, todayTracking) => {
  if (habits.length === 0) return 0;
  const completed = habits.filter(habit => todayTracking[habit.id]).length;
  return Math.round((completed / habits.length) * 100);
};

export const getStreak = (habitId) => {
  const tracking = JSON.parse(localStorage.getItem('habytarc_tracking') || '{}');
  const user = JSON.parse(localStorage.getItem('habytarc_user') || '{}');
  const cheatDay = user.cheatDay || 'sunday';
  
  let streak = 0;
  let currentDate = new Date();
  
  while (true) {
    const dateStr = getDateString(currentDate);
    
    // Skip cheat days
    if (!isCheatDayForDate(currentDate, cheatDay)) {
      if (tracking[dateStr] && tracking[dateStr][habitId]) {
        streak++;
      } else {
        break;
      }
    }
    
    // Move to previous day
    currentDate.setDate(currentDate.getDate() - 1);
    
    // Stop after 365 days
    if (streak > 365) break;
  }
  
  return streak;
};

export const isCheatDayForDate = (date, cheatDay) => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = date.getDay();
  return days[dayIndex] === cheatDay.toLowerCase();
};

export const getNextWeekdayDate = (weekdayName, fromDate = new Date(), includeToday = false) => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const normalized = String(weekdayName || 'sunday').toLowerCase();
  const targetIndex = days.indexOf(normalized);
  if (targetIndex < 0) return getDateString(fromDate);

  const start = new Date(fromDate);
  const startIndex = start.getDay();
  let delta = (targetIndex - startIndex + 7) % 7;
  if (delta === 0 && !includeToday) delta = 7;

  return getDateString(addDays(start, delta));
};

export const getCompletionPercentage = (habitId, days = 30) => {
  const tracking = JSON.parse(localStorage.getItem('habytarc_tracking') || '{}');
  const user = JSON.parse(localStorage.getItem('habytarc_user') || '{}');
  const cheatDay = user.cheatDay || 'sunday';
  
  let completed = 0;
  let total = 0;
  let currentDate = new Date();
  
  for (let i = 0; i < days; i++) {
    const dateStr = getDateString(currentDate);
    
    // Skip cheat days
    if (!isCheatDayForDate(currentDate, cheatDay)) {
      total++;
      if (tracking[dateStr] && tracking[dateStr][habitId]) {
        completed++;
      }
    }
    
    currentDate.setDate(currentDate.getDate() - 1);
  }
  
  return total === 0 ? 0 : Math.round((completed / total) * 100);
};

export const getLast7Days = () => {
  const days = [];
  const currentDate = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(currentDate.getDate() - i);
    days.push({
      date: getDateString(date),
      label: date.toLocaleDateString('en-US', { weekday: 'short' })
    });
  }
  
  return days;
};

export const getDayCompletionData = (habits, days = 30, tracking = {}) => {
  const data = [];
  const currentDate = new Date();
  const habitIds = new Set(habits.map(habit => habit.id));
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(currentDate.getDate() - i);
    const dateStr = getDateString(date);
    
    const dayTracking = tracking[dateStr] || {};
    const completed = Object.entries(dayTracking).filter(
      ([habitId, isDone]) => habitIds.has(habitId) && isDone
    ).length;
    const percentage = habits.length === 0 ? 0 : Math.round((completed / habits.length) * 100);
    
    data.push({
      date: dateStr,
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      percentage,
      completed,
      total: habits.length
    });
  }
  
  return data;
};
