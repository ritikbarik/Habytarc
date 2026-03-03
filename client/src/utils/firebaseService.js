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

const getTrackingDocId = (uid, date) => `v2_${uid}_${date}`;

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

export const getTrackingDocForDate = async (uid, date) => {
  const currentDoc = await getDoc(doc(db, 'tracking', getTrackingDocId(uid, date)));
  if (currentDoc.exists()) {
    const data = currentDoc.data();
    return {
      habits: data.habits || {},
      dayStatus: data.dayStatus || {},
      pendingTasks: data.pendingTasks || {}
    };
  }

  const legacyDoc = await getDoc(doc(db, 'tracking', `${uid}_${date}`));
  if (legacyDoc.exists()) {
    const data = legacyDoc.data();
    return {
      habits: data.habits || {},
      dayStatus: data.dayStatus || {},
      pendingTasks: data.pendingTasks || {}
    };
  }

  return { habits: {}, dayStatus: {}, pendingTasks: {} };
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
    history[data.date] = data.habits;
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
      history[data.date] = data.habits;
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
