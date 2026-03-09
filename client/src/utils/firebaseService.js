import { 
  collection, 
  doc, 
  addDoc,
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { auth } from '../config/firebase';
import { getDateString } from './dateUtils';

const getTrackingDocId = (uid, date) => `v2_${uid}_${date}`;
const getTodoCollectionRef = (uid) => collection(db, 'users', uid, 'todos');
const addDaysToKey = (dateKey, days) => {
  const base = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(base.getTime())) return getDateString();
  base.setDate(base.getDate() + days);
  return getDateString(base);
};

const upsertTrackingDoc = async (trackingRef, payload) => {
  try {
    await updateDoc(trackingRef, payload);
  } catch (error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    const isMissingDocError =
      code === 'not-found' ||
      code === 'firestore/not-found' ||
      message.includes('no document to update');

    if (isMissingDocError) {
      await setDoc(trackingRef, payload);
      return;
    }

    throw error;
  }
};

// User Services
export const createUserProfile = async (uid, userData) => {
  await setDoc(doc(db, 'users', uid), {
    ...userData,
    createdAt: new Date().toISOString()
  });
};

export const getUserProfile = async (uid) => {
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (userDoc.exists()) {
    return { id: userDoc.id, ...userDoc.data() };
  }
  return null;
};

export const updateUserProfile = async (uid, data) => {
  await updateDoc(doc(db, 'users', uid), data);
};

// Habit Services
export const createHabit = async (uid, habitData) => {
  const habitRef = doc(collection(db, 'habits'));
  await setDoc(habitRef, {
    ...habitData,
    userId: uid,
    enabled: true,
    createdAt: new Date().toISOString(),
    createdAtMs: Date.now()
  });
  return habitRef.id;
};

export const getUserHabits = async (uid) => {
  const habitsQuery = query(
    collection(db, 'habits'),
    where('userId', '==', uid)
  );
  const snapshot = await getDocs(habitsQuery);
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
};

export const subscribeToHabits = (uid, callback) => {
  const habitsQuery = query(
    collection(db, 'habits'),
    where('userId', '==', uid)
  );
  return onSnapshot(
    habitsQuery,
    (snapshot) => {
      const habits = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
      callback(habits);
    },
    (error) => {
      console.error('subscribeToHabits failed:', error);
      callback([]);
    }
  );
};

export const updateHabit = async (habitId, data) => {
  await updateDoc(doc(db, 'habits', habitId), data);
};

export const deleteHabit = async (habitId) => {
  await deleteDoc(doc(db, 'habits', habitId));
};

// To-Do Services
export const createTodo = async (uid, todoData) => {
  if (!uid) {
    throw new Error('Missing user ID');
  }

  const text = String(todoData?.text || '').trim();
  if (!text) {
    throw new Error('Task text is required');
  }

  const subtasks = Array.isArray(todoData?.subtasks)
    ? todoData.subtasks
        .filter((item) => item && String(item.text || '').trim())
        .map((item) => ({
          id: String(item.id || `st_${Date.now()}_${Math.floor(Math.random() * 10000)}`),
          text: String(item.text || '').trim(),
          completed: Boolean(item.completed)
        }))
    : [];

  const payload = {
    userId: uid,
    text,
    completed: false,
    category: String(todoData?.category || 'general').toLowerCase(),
    priority: String(todoData?.priority || 'medium').toLowerCase(),
    dueDate: String(todoData?.dueDate || getDateString()),
    recurrence: String(todoData?.recurrence || 'none').toLowerCase(),
    reminderEnabled: Boolean(todoData?.reminderEnabled && String(todoData?.reminderTime || '').trim()),
    reminderTime: String(todoData?.reminderTime || '').trim(),
    notes: String(todoData?.notes || '').trim(),
    subtasks,
    dayKey: String(todoData?.dayKey || getDateString()),
    createdAt: new Date().toISOString(),
    createdAtMs: Date.now()
  };

  const todoRef = await addDoc(getTodoCollectionRef(uid), payload);
  return todoRef.id;
};

export const subscribeToTodos = (uid, callback, dayKey = getDateString()) => {
  if (!uid) {
    callback([]);
    return () => {};
  }

  const todosQuery = query(getTodoCollectionRef(uid), where('dayKey', '==', dayKey));

  return onSnapshot(
    todosQuery,
    (snapshot) => {
      const todos = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data()
        }))
        .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
      callback(todos);
    },
    (error) => {
      console.error('subscribeToTodos failed:', error);
      callback([]);
    }
  );
};

export const updateTodo = async (uid, todoId, data) => {
  if (!uid || !todoId) {
    throw new Error('Missing to-do update fields');
  }

  await updateDoc(doc(db, 'users', uid, 'todos', todoId), data || {});
};

export const completeTodoWithRecurrence = async (uid, todoId) => {
  if (!uid || !todoId) {
    throw new Error('Missing to-do completion fields');
  }

  const ref = doc(db, 'users', uid, 'todos', todoId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    throw new Error('To-do not found');
  }

  const todo = snapshot.data();
  await updateDoc(ref, { completed: true, completedAtMs: Date.now() });

  const recurrence = String(todo?.recurrence || 'none').toLowerCase();
  if (recurrence === 'none') return;

  const intervalDays = recurrence === 'weekly' ? 7 : recurrence === 'monthly' ? 30 : 1;
  const baseKey = String(todo?.dueDate || todo?.dayKey || getDateString());
  const nextDue = addDaysToKey(baseKey, intervalDays);

  await addDoc(getTodoCollectionRef(uid), {
    userId: uid,
    text: String(todo?.text || ''),
    completed: false,
    category: String(todo?.category || 'general').toLowerCase(),
    priority: String(todo?.priority || 'medium').toLowerCase(),
    dueDate: nextDue,
    recurrence,
    reminderEnabled: Boolean(todo?.reminderEnabled && String(todo?.reminderTime || '').trim()),
    reminderTime: String(todo?.reminderTime || '').trim(),
    notes: String(todo?.notes || ''),
    subtasks: Array.isArray(todo?.subtasks)
      ? todo.subtasks.map((item) => ({
          id: String(item?.id || `st_${Date.now()}_${Math.floor(Math.random() * 10000)}`),
          text: String(item?.text || ''),
          completed: false
        }))
      : [],
    dayKey: nextDue,
    createdAt: new Date().toISOString(),
    createdAtMs: Date.now()
  });
};

export const deleteTodo = async (uid, todoId) => {
  if (!uid || !todoId) {
    throw new Error('Missing to-do delete fields');
  }

  await deleteDoc(doc(db, 'users', uid, 'todos', todoId));
};

// Tracking Services
export const saveTracking = async (uid, date, habitId, completed) => {
  const trackingRef = doc(db, 'tracking', getTrackingDocId(uid, date));

  try {
    await upsertTrackingDoc(trackingRef, {
      userId: uid,
      date,
      [`habits.${habitId}`]: completed,
      [`dayStatus.${habitId}`]: completed ? 'completed' : 'pending'
    });
  } catch (error) {
    console.error('saveTracking failed:', error);
    throw error;
  }
};

export const saveHabitNote = async (uid, date, habitId, note) => {
  const trackingRef = doc(db, 'tracking', getTrackingDocId(uid, date));
  await upsertTrackingDoc(trackingRef, {
    userId: uid,
    date,
    [`habitNotes.${habitId}`]: String(note || '').trim()
  });
};

export const getTrackingDocForDate = async (uid, date) => {
  const currentDoc = await getDoc(doc(db, 'tracking', getTrackingDocId(uid, date)));
  if (currentDoc.exists()) {
    const data = currentDoc.data();
    return {
      habits: data.habits || {},
      dayStatus: data.dayStatus || {},
      pendingTasks: data.pendingTasks || {},
      habitNotes: data.habitNotes || {}
    };
  }

  const legacyDoc = await getDoc(doc(db, 'tracking', `${uid}_${date}`));
  if (legacyDoc.exists()) {
    const data = legacyDoc.data();
    return {
      habits: data.habits || {},
      dayStatus: data.dayStatus || {},
      pendingTasks: data.pendingTasks || {},
      habitNotes: data.habitNotes || {}
    };
  }

  return { habits: {}, dayStatus: {}, pendingTasks: {}, habitNotes: {} };
};

export const setHabitDayStatus = async (uid, date, habitId, status) => {
  const trackingRef = doc(db, 'tracking', getTrackingDocId(uid, date));
  const normalized = String(status || '').toLowerCase();
  await upsertTrackingDoc(trackingRef, {
    userId: uid,
    date,
    [`dayStatus.${habitId}`]: normalized,
    ...(normalized === 'completed'
      ? { [`habits.${habitId}`]: true }
      : { [`habits.${habitId}`]: false })
  });
};

export const upsertPendingTask = async (uid, sourceDate, task) => {
  if (!task?.habitId || !task?.dueDate || !sourceDate) {
    throw new Error('Missing pending task fields');
  }

  const trackingRef = doc(db, 'tracking', getTrackingDocId(uid, sourceDate));
  const taskId = `pt_${task.habitId}_${sourceDate}`;
  const createdAtMs = Date.now();
  const payload = {
    id: taskId,
    habitId: task.habitId,
    habitName: task.habitName || 'Habit',
    sourceDate,
    dueDate: task.dueDate,
    status: 'pending',
    createdAtMs
  };

  await upsertTrackingDoc(trackingRef, {
    userId: uid,
    date: sourceDate,
    [`pendingTasks.${taskId}`]: payload
  });

  return payload;
};

export const resolvePendingTask = async (uid, sourceDate, taskId, status = 'done') => {
  const trackingRef = doc(db, 'tracking', getTrackingDocId(uid, sourceDate));
  await upsertTrackingDoc(trackingRef, {
    userId: uid,
    date: sourceDate,
    [`pendingTasks.${taskId}.status`]: status,
    [`pendingTasks.${taskId}.resolvedAtMs`]: Date.now()
  });
};

export const getPendingTasksUpToDate = async (uid, date) => {
  const trackingQuery = query(
    collection(db, 'tracking'),
    where('userId', '==', uid)
  );
  const snapshot = await getDocs(trackingQuery);
  const dueBy = String(date || '');
  const pending = [];

  snapshot.docs.forEach((item) => {
    const data = item.data();
    const pendingMap = data?.pendingTasks || {};
    Object.values(pendingMap).forEach((task) => {
      if (!task || task.status !== 'pending') return;
      if (dueBy && String(task.dueDate || '') > dueBy) return;
      pending.push(task);
    });
  });

  return pending.sort((a, b) => {
    const dueA = String(a.dueDate || '');
    const dueB = String(b.dueDate || '');
    if (dueA !== dueB) return dueA.localeCompare(dueB);
    return Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0);
  });
};

export const getPendingTasksForDate = async (uid, date) => {
  const target = String(date || '');
  if (!target) return [];

  const trackingQuery = query(
    collection(db, 'tracking'),
    where('userId', '==', uid)
  );
  const snapshot = await getDocs(trackingQuery);
  const pending = [];

  snapshot.docs.forEach((item) => {
    const data = item.data();
    const pendingMap = data?.pendingTasks || {};
    Object.values(pendingMap).forEach((task) => {
      if (!task || task.status !== 'pending') return;
      if (String(task.dueDate || '') !== target) return;
      pending.push(task);
    });
  });

  return pending.sort((a, b) => Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0));
};

export const submitAnonymousFeedback = async (payload) => {
  const uid = auth.currentUser?.uid || null;
  const entry = {
    message: String(payload?.message || '').trim(),
    category: String(payload?.category || 'general').toLowerCase(),
    rating: Number(payload?.rating || 0),
    contact: String(payload?.contact || '').trim(),
    anonymous: true,
    ...(uid ? { submittedBy: uid } : {}),
    source: 'web',
    createdAt: new Date().toISOString(),
    createdAtMs: Date.now()
  };

  if (!entry.message) {
    throw new Error('Feedback message is required');
  }

  // Store feedback in top-level collection so it appears in Firestore root.
  await addDoc(collection(db, 'feedback'), entry);
};

export const getTrackingForDate = async (uid, date) => {
  const currentDoc = await getDoc(doc(db, 'tracking', getTrackingDocId(uid, date)));
  if (currentDoc.exists()) {
    return currentDoc.data().habits || {};
  }

  // Backward compatibility with older document ID format.
  const legacyDoc = await getDoc(doc(db, 'tracking', `${uid}_${date}`));
  if (legacyDoc.exists()) {
    return legacyDoc.data().habits || {};
  }

  return {};
};

export const getTrackingHistory = async (uid, days = 90) => {
  const trackingQuery = query(
    collection(db, 'tracking'),
    where('userId', '==', uid)
  );
  const snapshot = await getDocs(trackingQuery);
  
  const history = {};
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (!data?.date || typeof data.date !== 'string') return;
    history[data.date] = data.habits || {};
  });
  
  return history;
};

export const subscribeToTracking = (uid, callback) => {
  const trackingQuery = query(
    collection(db, 'tracking'),
    where('userId', '==', uid)
  );
  return onSnapshot(trackingQuery, (snapshot) => {
    const history = {};
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (!data?.date || typeof data.date !== 'string') return;
      history[data.date] = data.habits || {};
    });
    callback(history);
  });
};

// AI Chat Services
export const saveAIChatMessage = async (uid, message) => {
  await addDoc(collection(db, 'users', uid, 'ai_chat'), {
    role: message.role,
    text: message.text,
    createdAt: new Date().toISOString(),
    createdAtMs: Date.now()
  });
};

export const getAIChatHistory = async (uid, maxMessages = 100) => {
  const historyQuery = query(
    collection(db, 'users', uid, 'ai_chat'),
    orderBy('createdAtMs', 'asc'),
    limit(maxMessages)
  );

  const snapshot = await getDocs(historyQuery);
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data()
  }));
};

export const clearAIChatHistory = async (uid) => {
  const historyRef = collection(db, 'users', uid, 'ai_chat');
  const snapshot = await getDocs(historyRef);
  if (snapshot.empty) return;

  const batch = writeBatch(db);
  snapshot.docs.forEach((item) => batch.delete(item.ref));
  await batch.commit();
};
