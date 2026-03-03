const keywordRules = [
  {
    keywords: ['motivation', 'lazy', 'stuck', 'discipline'],
    reply:
      'Focus on identity, not mood: say "I am a person who shows up daily." Start with your 2-minute version right now.'
  },
  {
    keywords: ['time', 'busy', 'schedule'],
    reply:
      'Use habit stacking and time blocking. Example: "After breakfast at 8:00 AM, I will do 10 minutes of my habit."'
  },
  {
    keywords: ['missed', 'skip', 'failed', 'broke'],
    reply:
      'Use the Atomic rule: miss once, never miss twice. Do the smallest possible version today to recover momentum.'
  },
  {
    keywords: ['consistency', 'streak'],
    reply:
      'Make the cue obvious and friction low. Keep tools ready in advance so starting is easier than avoiding.'
  },
  {
    keywords: ['reward', 'boring'],
    reply:
      'Attach an immediate reward after completion, even small: check it off, short walk, favorite song, or tea break.'
  }
];

const fallbacks = [
  'Design your environment so good habits are visible and easy.',
  'Shrink the habit until it feels too easy to fail.',
  'Track reps, not perfection. Consistency compounds.',
  'Build systems that make good actions automatic.',
  'If it feels hard to start, reduce the first step.'
];

const getFallback = () => fallbacks[Math.floor(Math.random() * fallbacks.length)];

export const buildCoachReply = (message, context = {}) => {
  const text = String(message || '').toLowerCase();
  const activeHabits = Array.isArray(context.activeHabits) ? context.activeHabits : [];
  const completedCount = Number(context.completedCount || 0);

  const matchedRule = keywordRules.find((rule) =>
    rule.keywords.some((keyword) => text.includes(keyword))
  );

  const statusLine =
    activeHabits.length > 0
      ? `You currently have ${activeHabits.length} active habit(s), with ${completedCount} completed today.`
      : 'You currently have no active habits. Start with one tiny daily habit.';

  const actionLine =
    activeHabits.length > 0
      ? `Next action: ${activeHabits[0].name} -> ${activeHabits[0].tinyStep || 'do a 2-minute version now'}.`
      : 'Next action: define one cue, one tiny step, and one reward in Habits.';

  return `${matchedRule ? matchedRule.reply : getFallback()} ${statusLine} ${actionLine}`;
};

