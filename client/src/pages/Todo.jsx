import React, { useEffect, useMemo, useState } from 'react';
import { completeTodoWithRecurrence, createTodo, deleteTodo, subscribeToTodos, updateTodo } from '../utils/firebaseService';
import { getDateString } from '../utils/dateUtils';

const previewTodos = [
  { id: 'pt1', text: 'Prepare tomorrow plan', completed: false, priority: 'high', category: 'work', recurrence: 'none', createdAtMs: Date.now() - 100000 },
  { id: 'pt2', text: 'Review habit streaks', completed: true, priority: 'medium', category: 'planning', recurrence: 'daily', createdAtMs: Date.now() - 200000 },
  { id: 'pt3', text: 'Read 15 pages', completed: false, priority: 'low', category: 'learning', recurrence: 'none', createdAtMs: Date.now() - 300000 }
];

function Todo({ user, isPreview = false }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTodo, setNewTodo] = useState({
    text: '',
    category: 'general',
    priority: 'medium',
    dueDate: getDateString(),
    recurrence: 'none',
    notes: '',
    subtasksText: ''
  });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [todoDayKey, setTodoDayKey] = useState(() => getDateString());

  useEffect(() => {
    const timer = setInterval(() => {
      const next = getDateString();
      setTodoDayKey((prev) => (prev === next ? prev : next));
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isPreview) {
      setTodos(previewTodos);
      setLoading(false);
      return () => {};
    }

    const unsubscribe = subscribeToTodos(user.uid, (list) => {
      setTodos(list);
      setLoading(false);
    }, todoDayKey);

    return () => unsubscribe();
  }, [isPreview, user?.uid, todoDayKey]);

  const filteredTodos = useMemo(() => {
    if (filter === 'open') return todos.filter((item) => !item.completed);
    if (filter === 'done') return todos.filter((item) => item.completed);
    return todos;
  }, [todos, filter]);

  const openCount = todos.filter((item) => !item.completed).length;
  const dueTodayCount = todos.filter((item) => String(item.dueDate || todoDayKey) === todoDayKey && !item.completed).length;

  const lockAction = () => {
    alert('Login to continue');
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    const trimmed = newTodo.text.trim();
    if (!trimmed) return;
    setError('');
    setSuccess('');
    if (isPreview) {
      lockAction();
      return;
    }
    setSaving(true);
    try {
      const subtasks = String(newTodo.subtasksText || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((textValue, idx) => ({
          id: `st_${Date.now()}_${idx}`,
          text: textValue,
          completed: false
        }));

      const todoId = await createTodo(user.uid, {
        text: trimmed,
        category: newTodo.category,
        priority: newTodo.priority,
        dueDate: newTodo.dueDate || todoDayKey,
        recurrence: newTodo.recurrence,
        notes: newTodo.notes,
        dayKey: newTodo.dueDate || todoDayKey,
        subtasks
      });
      const optimistic = {
        id: todoId,
        userId: user.uid,
        text: trimmed,
        completed: false,
        category: newTodo.category,
        priority: newTodo.priority,
        dueDate: newTodo.dueDate || todoDayKey,
        recurrence: newTodo.recurrence,
        notes: newTodo.notes,
        dayKey: newTodo.dueDate || todoDayKey,
        subtasks,
        createdAt: new Date().toISOString(),
        createdAtMs: Date.now()
      };
      setTodos((prev) => {
        const exists = prev.some((item) => item.id === optimistic.id);
        return exists ? prev : [optimistic, ...prev];
      });
      setNewTodo({
        text: '',
        category: 'general',
        priority: 'medium',
        dueDate: getDateString(),
        recurrence: 'none',
        notes: '',
        subtasksText: ''
      });
      setSuccess('To-do added.');
    } catch (error) {
      console.error('Add todo failed:', error);
      setError(error?.message || 'Failed to add to-do.');
    } finally {
      setSaving(false);
    }
  };

  const completeTodo = async (item) => {
    if (isPreview) {
      lockAction();
      return;
    }
    try {
      if (item.completed) {
        await updateTodo(user.uid, item.id, { completed: false });
      } else {
        await completeTodoWithRecurrence(user.uid, item.id);
      }
      setError('');
    } catch (error) {
      console.error('Complete todo failed:', error);
      setError(error?.message || 'Failed to complete to-do.');
    }
  };

  const removeTodo = async (item) => {
    if (isPreview) {
      lockAction();
      return;
    }
    try {
      await deleteTodo(user.uid, item.id);
      setError('');
    } catch (error) {
      console.error('Delete todo failed:', error);
      setError(error?.message || 'Failed to delete to-do.');
    }
  };

  const toggleSubtask = async (todo, subtaskId) => {
    if (isPreview) {
      lockAction();
      return;
    }
    const next = (todo.subtasks || []).map((item) =>
      item.id === subtaskId ? { ...item, completed: !item.completed } : item
    );
    try {
      await updateTodo(user.uid, todo.id, { subtasks: next });
    } catch (error) {
      console.error('Subtask update failed:', error);
      setError(error?.message || 'Failed to update subtask.');
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Loading to-dos...</p>
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
            <h1>To-Do List</h1>
            <p className="page-subtitle">{openCount} open task(s) • {dueTodayCount} due today</p>
          </div>
        </div>

        {isPreview && (
          <div className="chart-container" style={{ marginBottom: '1rem', borderColor: 'var(--primary)' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Preview mode is read-only. Login to add or update to-dos.</p>
          </div>
        )}

        {error && (
          <div className="error-message" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              marginBottom: '1rem',
              border: '1px solid rgba(5,150,105,0.35)',
              background: 'rgba(5,150,105,0.1)',
              color: 'var(--success)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem'
            }}
          >
            {success}
          </div>
        )}

        <div className="chart-container todo-composer">
          <form onSubmit={handleAdd} className="todo-form">
            <div className="todo-form-primary">
              <input
                type="text"
                value={newTodo.text}
                onChange={(e) => setNewTodo((prev) => ({ ...prev, text: e.target.value }))}
                placeholder="Add a task..."
                className="chat-input"
                disabled={saving}
              />
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Adding...' : 'Add'}
              </button>
            </div>

            <div className="todo-form-advanced">
              <select
                value={newTodo.priority}
                onChange={(e) => setNewTodo((prev) => ({ ...prev, priority: e.target.value }))}
                className="chat-input todo-field-sm"
                disabled={saving}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <input
                type="text"
                value={newTodo.category}
                onChange={(e) => setNewTodo((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="Category"
                className="chat-input todo-field-sm"
                disabled={saving}
              />
              <input
                type="date"
                value={newTodo.dueDate}
                onChange={(e) => setNewTodo((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="chat-input todo-field-sm"
                disabled={saving}
              />
              <select
                value={newTodo.recurrence}
                onChange={(e) => setNewTodo((prev) => ({ ...prev, recurrence: e.target.value }))}
                className="chat-input todo-field-sm"
                disabled={saving}
              >
                <option value="none">No Repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <input
                type="text"
                value={newTodo.subtasksText}
                onChange={(e) => setNewTodo((prev) => ({ ...prev, subtasksText: e.target.value }))}
                placeholder="Subtasks (comma separated)"
                className="chat-input"
                disabled={saving}
              />
              <input
                type="text"
                value={newTodo.notes}
                onChange={(e) => setNewTodo((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Notes (optional)"
                className="chat-input"
                disabled={saving}
              />
            </div>
          </form>
          <div className="todo-filter-row">
            <button type="button" className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('all')}>All</button>
            <button type="button" className={`btn ${filter === 'open' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('open')}>Open</button>
            <button type="button" className={`btn ${filter === 'done' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('done')}>Done</button>
          </div>
        </div>

        <div className="habits-list">
          {filteredTodos.length === 0 ? (
            <div className="empty-state" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
              <h3>No tasks here</h3>
              <p>Add a new to-do to start.</p>
            </div>
          ) : (
            filteredTodos.map((item) => (
              <div key={item.id} className={`habit-item ${item.completed ? 'completed' : ''}`} style={{ cursor: 'default' }}>
                <div className="habit-content" style={{ alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => completeTodo(item)}
                    style={{ padding: '0.35rem 0.65rem' }}
                  >
                    {item.completed ? 'Undo' : 'Done'}
                  </button>
                  <div className="habit-details">
                    <h3 style={{ textDecoration: item.completed ? 'line-through' : 'none' }}>{item.text}</h3>
                    <span className="habit-category">
                      {(item.completed ? 'Completed' : 'Open')}
                      {` • ${String(item.priority || 'medium').toUpperCase()}`}
                      {` • ${item.category || 'general'}`}
                      {item.dueDate ? ` • Due ${item.dueDate}` : ''}
                      {item.recurrence && item.recurrence !== 'none' ? ` • Repeats ${item.recurrence}` : ''}
                    </span>
                    {item.notes ? (
                      <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.85rem' }}>
                        {item.notes}
                      </p>
                    ) : null}
                    {Array.isArray(item.subtasks) && item.subtasks.length > 0 ? (
                      <div style={{ marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {item.subtasks.map((subtask) => (
                          <label key={subtask.id} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <input
                              type="checkbox"
                              checked={Boolean(subtask.completed)}
                              onChange={() => toggleSubtask(item, subtask.id)}
                              disabled={item.completed}
                            />
                            <span style={{ textDecoration: subtask.completed ? 'line-through' : 'none' }}>
                              {subtask.text}
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => removeTodo(item)}
                  style={{ padding: '0.4rem 0.7rem' }}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default Todo;
