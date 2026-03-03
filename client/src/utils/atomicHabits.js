export const atomicLaws = [
  {
    id: 'obvious',
    title: 'Make It Obvious',
    field: 'cue',
    prompt: 'When and where will you do this habit?'
  },
  {
    id: 'attractive',
    title: 'Make It Attractive',
    field: 'identity',
    prompt: 'Who are you becoming through this habit?'
  },
  {
    id: 'easy',
    title: 'Make It Easy',
    field: 'tinyStep',
    prompt: 'What is the 2-minute version of this habit?'
  },
  {
    id: 'satisfying',
    title: 'Make It Satisfying',
    field: 'reward',
    prompt: 'What immediate reward will reinforce it?'
  }
];

export const atomicTips = [
  'Habit stacking: "After [current habit], I will [new habit]."',
  'Environment beats willpower. Make good cues visible.',
  'Use the 2-minute rule to start tiny and stay consistent.',
  'Track every rep. What gets measured gets improved.',
  'Miss once, never miss twice.'
];

export const getAtomicCoverage = (habits = []) => {
  if (!habits.length) return 0;

  const covered = habits.filter((habit) =>
    atomicLaws.every((law) => {
      const value = habit?.[law.field];
      return typeof value === 'string' && value.trim().length > 0;
    })
  ).length;

  return Math.round((covered / habits.length) * 100);
};
