import React, { useEffect, useMemo, useState } from 'react';
import { getUserHabits, getTrackingHistory } from '../utils/firebaseService';
import { getDateString, getHabitStreakMap, isCheatDayForDate } from '../utils/dateUtils';

const SERIES_COLORS = [
  '#2563eb',
  '#059669',
  '#f59e0b',
  '#dc2626',
  '#7c3aed',
  '#0ea5e9',
  '#ef4444',
  '#84cc16'
];

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getHabitStartDate = (habit) => {
  if (habit?.createdAtMs) {
    const byMs = new Date(habit.createdAtMs);
    if (!Number.isNaN(byMs.getTime())) return byMs;
  }
  return toDate(habit?.createdAt) || new Date();
};

const buildDateRange = (startDate, endDate) => {
  const range = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  while (cursor <= end) {
    range.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return range;
};

const pointsFromSeries = (values, width, height, minXStep) => {
  const validIndexes = values
    .map((value, idx) => ({ value, idx }))
    .filter((item) => item.value !== null);

  if (validIndexes.length < 2) return '';

  return validIndexes
    .map(({ value, idx }) => {
      const x = idx * minXStep;
      const y = height - (value / 100) * height;
      return `${x},${Math.max(0, Math.min(height, y))}`;
    })
    .join(' ');
};

const getSeriesPoints = (values, height, xStep) =>
  values
    .map((value, idx) => ({ value, idx }))
    .filter((item) => item.value !== null)
    .map(({ value, idx }) => ({
      idx,
      x: idx * xStep,
      y: height - (value / 100) * height,
      value
    }));

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const previewHabits = [
  { id: 'p1', name: 'Morning Walk', icon: '🚶', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'p2', name: 'Deep Work Sprint', icon: '💻', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'p3', name: 'Read 20 mins', icon: '📚', createdAt: '2026-01-01T00:00:00.000Z' }
];

const buildPreviewHistory = () => {
  const out = {};
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = getDateString(date);
    out[key] = {
      p1: true,
      p2: i % 3 !== 0,
      p3: i % 4 !== 0
    };
  }
  return out;
};

function Stats({ user, userData, isPreview = false }) {
  const [habits, setHabits] = useState([]);
  const [trackingHistory, setTrackingHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState(30);
  const [chartMode, setChartMode] = useState('combined');
  const cheatDay = String(userData?.cheatDay || 'sunday').toLowerCase();

  useEffect(() => {
    if (isPreview) {
      setHabits(previewHabits);
      setTrackingHistory(buildPreviewHistory());
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        const [fetchedHabits, history] = await Promise.all([
          getUserHabits(user.uid),
          getTrackingHistory(user.uid)
        ]);

        const enabledHabits = fetchedHabits.filter((habit) => habit.enabled !== false);
        setHabits(enabledHabits);
        setTrackingHistory(history);
      } catch (error) {
        console.error('Error loading stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isPreview, user?.uid]);

  const chartData = useMemo(() => {
    if (habits.length === 0) {
      return {
        labels: [],
        combinedSeries: [],
        habitSeries: [],
        daysTracked: 0
      };
    }

    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    startDate.setDate(startDate.getDate() - (selectedRange - 1));

    const days = buildDateRange(startDate, today);
    const dateKeys = days.map((day) => getDateString(day));

    const habitStarts = habits.map((habit) => {
      const start = getHabitStartDate(habit);
      return getDateString(start);
    });

    const combinedSeries = dateKeys.map((dateKey) => {
      const date = new Date(`${dateKey}T00:00:00`);
      if (isCheatDayForDate(date, cheatDay)) return null;
      const dayTracking = trackingHistory[dateKey] || {};
      const startedHabits = habits.filter((_, idx) => habitStarts[idx] <= dateKey);
      if (startedHabits.length === 0) return null;
      const completed = startedHabits.filter((habit) => dayTracking[habit.id]).length;
      return Math.round((completed / startedHabits.length) * 100);
    });

    const habitSeries = habits.map((habit, idx) => {
      const startKey = habitStarts[idx];
      const values = dateKeys.map((dateKey) => {
        const date = new Date(`${dateKey}T00:00:00`);
        if (isCheatDayForDate(date, cheatDay)) return null;
        if (dateKey < startKey) return null;
        const dayTracking = trackingHistory[dateKey] || {};
        return dayTracking[habit.id] ? 100 : 0;
      });
      return {
        id: habit.id,
        name: habit.name,
        values,
        color: SERIES_COLORS[idx % SERIES_COLORS.length]
      };
    });

    return {
      labels: dateKeys.map((dateKey) => {
        const date = new Date(`${dateKey}T00:00:00`);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      combinedSeries,
      habitSeries,
      daysTracked: days.filter((day) => !isCheatDayForDate(day, cheatDay)).length
    };
  }, [habits, trackingHistory, selectedRange, cheatDay]);

  const combinedValues = chartData.combinedSeries.filter((value) => value !== null);
  const overallCompletion = combinedValues.length
    ? Math.round(combinedValues.reduce((sum, value) => sum + value, 0) / combinedValues.length)
    : 0;
  const streakMap = useMemo(
    () => getHabitStreakMap(habits, trackingHistory, cheatDay),
    [habits, trackingHistory, cheatDay]
  );
  const bestStreak = Object.values(streakMap).reduce((max, value) => Math.max(max, value), 0);
  const dailyProgress =
    chartData.combinedSeries.length > 0
      ? chartData.combinedSeries[chartData.combinedSeries.length - 1] || 0
      : 0;
  const todayIndex = chartData.labels.length > 0 ? chartData.labels.length - 1 : 0;

  const chartHeight = 220;
  const xStep = selectedRange === 90 ? 16 : selectedRange === 30 ? 24 : 34;
  const chartWidth = Math.max((chartData.labels.length - 1) * xStep, 320);

  const dayInsights = useMemo(() => {
    const stats = WEEKDAYS.reduce((acc, day) => {
      acc[day] = { total: 0, completed: 0 };
      return acc;
    }, {});

    Object.entries(trackingHistory || {}).forEach(([dateKey, habitsMap]) => {
      const date = new Date(`${dateKey}T00:00:00`);
      if (Number.isNaN(date.getTime())) return;
      if (isCheatDayForDate(date, cheatDay)) return;
      const dayName = WEEKDAYS[date.getDay()];
      const values = Object.values(habitsMap || {});
      if (!values.length) return;
      stats[dayName].total += values.length;
      stats[dayName].completed += values.filter(Boolean).length;
    });

    const ranked = WEEKDAYS.map((day) => {
      const total = stats[day].total || 0;
      const completion = total ? Math.round((stats[day].completed / total) * 100) : 0;
      return { day, completion };
    }).sort((a, b) => b.completion - a.completion);

    return {
      ranked,
      best: ranked[0] || { day: 'N/A', completion: 0 },
      worst: ranked[ranked.length - 1] || { day: 'N/A', completion: 0 }
    };
  }, [trackingHistory, cheatDay]);

  const heatmapDays = useMemo(() => {
    const out = [];
    const today = new Date();
    for (let i = 89; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = getDateString(d);
      if (isCheatDayForDate(d, cheatDay)) {
        out.push({ key, ratio: null });
        continue;
      }
      const dayData = trackingHistory[key] || {};
      const values = Object.values(dayData);
      const ratio = values.length ? values.filter(Boolean).length / values.length : 0;
      out.push({ key, ratio });
    }
    return out;
  }, [trackingHistory, cheatDay]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Loading stats...</p>
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
            <h1>Statistics</h1>
            <p className="page-subtitle">Track your progress</p>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Overall Completion</div>
            <div className="stat-value">{overallCompletion}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active Habits</div>
            <div className="stat-value">{habits.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Cheat Day</div>
            <div className="stat-value" style={{ fontSize: '1.25rem', textTransform: 'capitalize' }}>
              {userData?.cheatDay || 'Sunday'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Daily Progress</div>
            <div className="stat-value">{dailyProgress}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Best Current Streak</div>
            <div className="stat-value">{bestStreak}d</div>
          </div>
        </div>

        <div className="chart-container">
          <div className="chart-header">
            <h2>Insights</h2>
          </div>
          <p style={{ marginTop: '0.9rem', color: 'var(--text-secondary)' }}>
            Best day: <strong>{dayInsights.best.day}</strong> ({dayInsights.best.completion}%)
            {' • '}
            Toughest day: <strong>{dayInsights.worst.day}</strong> ({dayInsights.worst.completion}%)
          </p>
          <div style={{ marginTop: '0.9rem', display: 'grid', gridTemplateColumns: 'repeat(18, minmax(0, 1fr))', gap: '4px' }}>
            {heatmapDays.map((item) => {
              const isCheat = item.ratio === null;
              const alpha = isCheat ? 0.03 : item.ratio <= 0 ? 0.08 : Math.min(0.22 + item.ratio * 0.68, 0.9);
              return (
                <div
                  key={item.key}
                  title={isCheat ? `${item.key} • Cheat day` : `${item.key} • ${Math.round(item.ratio * 100)}%`}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: '3px',
                    border: '1px solid var(--border-color)',
                    background: isCheat ? `rgba(148, 163, 184, ${alpha})` : `rgba(37, 99, 235, ${alpha})`
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="chart-container">
          <div className="chart-header">
            <h2>Habit Performance (Last {selectedRange} Days)</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="period-selector" role="group" aria-label="Select chart view mode">
                <button
                  type="button"
                  className={chartMode === 'combined' ? 'active' : ''}
                  onClick={() => setChartMode('combined')}
                >
                  Combined
                </button>
                <button
                  type="button"
                  className={chartMode === 'detailed' ? 'active' : ''}
                  onClick={() => setChartMode('detailed')}
                >
                  Detailed
                </button>
              </div>
              <div className="period-selector" role="group" aria-label="Select performance range">
                {[7, 30, 90].map((range) => (
                  <button
                    key={range}
                    type="button"
                    className={selectedRange === range ? 'active' : ''}
                    onClick={() => setSelectedRange(range)}
                  >
                    {range} Days
                  </button>
                ))}
              </div>
            </div>
          </div>

          {habits.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <p>No habits yet. Add habits to see your performance lines.</p>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
                <svg
                  width={chartWidth}
                  height={chartHeight + 40}
                  role="img"
                  aria-label="Habit performance line graph"
                >
                  {[0, 25, 50, 75, 100].map((tick) => {
                    const y = chartHeight - (tick / 100) * chartHeight;
                    return (
                      <g key={`grid-${tick}`}>
                        <line
                          x1="0"
                          y1={y}
                          x2={chartWidth}
                          y2={y}
                          stroke="var(--border-color)"
                          strokeWidth="1"
                        />
                        <text x="0" y={Math.max(y - 4, 10)} fontSize="10" fill="var(--text-secondary)">
                          {tick}%
                        </text>
                      </g>
                    );
                  })}

                  {chartMode === 'detailed' &&
                    chartData.habitSeries.map((series) => (
                      <g key={series.id}>
                        <polyline
                          fill="none"
                          stroke={series.color}
                          strokeWidth="2"
                          opacity="0.7"
                          points={pointsFromSeries(series.values, chartWidth, chartHeight, xStep)}
                        />
                      </g>
                    ))}

                  <g>
                    <polyline
                      fill="none"
                      stroke="var(--text-primary)"
                      strokeWidth="3"
                      points={pointsFromSeries(chartData.combinedSeries, chartWidth, chartHeight, xStep)}
                    />
                    {getSeriesPoints(chartData.combinedSeries, chartHeight, xStep).map((point) => (
                      <circle
                        key={`combined-${point.x}`}
                        cx={point.x}
                        cy={point.y}
                        r={point.idx === todayIndex ? 5 : 3}
                        fill="var(--text-primary)"
                      >
                        <title>{`Combined: ${point.value}%`}</title>
                      </circle>
                    ))}
                  </g>

                  {chartData.labels.map((label, idx) => {
                    if (idx % Math.max(Math.ceil(chartData.labels.length / 6), 1) !== 0) return null;
                    const x = idx * xStep;
                    return (
                      <text key={`x-${label}-${idx}`} x={x} y={chartHeight + 20} fontSize="10" fill="var(--text-secondary)">
                        {label}
                      </text>
                    );
                  })}
                </svg>
              </div>

              <div className="profile-badges" style={{ marginTop: '0.75rem' }}>
                <span className="badge" style={{ borderColor: 'var(--text-primary)', color: 'var(--text-primary)', fontWeight: 700 }}>
                  Today Combined: {dailyProgress}%
                </span>
                <span className="badge" style={{ borderColor: 'var(--text-primary)', color: 'var(--text-primary)' }}>
                  Combined Performance
                </span>
                {chartMode === 'detailed' &&
                  chartData.habitSeries.map((series) => (
                    <span key={`legend-${series.id}`} className="badge" style={{ borderColor: series.color, color: series.color }}>
                      {series.name}
                    </span>
                  ))}
              </div>
              <p style={{ marginTop: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Timeline covers the recent {chartData.daysTracked} day(s).
              </p>

              {habits.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', marginBottom: '0.6rem' }}>Current Streak by Habit</h3>
                  <div className="profile-badges">
                    {habits.map((habit) => (
                      <span key={`streak-${habit.id}`} className="badge">
                        {habit.icon} {habit.name}: {streakMap[habit.id] || 0}d
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Stats;
