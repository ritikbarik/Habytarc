import React, { useState } from 'react';
import { submitAnonymousFeedback } from '../utils/firebaseService';

function Feedback({ isPreview = false }) {
  const [form, setForm] = useState({
    category: 'general',
    rating: 5,
    message: '',
    contact: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await submitAnonymousFeedback(form);
      setSuccess('Thanks. Your anonymous feedback was submitted.');
      setForm((prev) => ({ ...prev, message: '', contact: '' }));
    } catch (err) {
      console.error('Feedback submit failed:', err);
      const permissionDenied = String(err?.code || '').toLowerCase().includes('permission-denied')
        || String(err?.message || '').toLowerCase().includes('insufficient permissions');
      setError(
        permissionDenied
          ? 'Feedback is blocked by Firestore rules. Please allow writes to /feedback or /users/{uid}/feedback.'
          : (err?.message || 'Failed to submit feedback. Please try again.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>Feedback & Connect</h1>
            <p className="page-subtitle">Share ideas anonymously or contact the team directly</p>
          </div>
        </div>

        {isPreview && (
          <div className="chart-container feedback-preview-banner">
            <p style={{ color: 'var(--text-secondary)' }}>Preview mode is read-only. Login to submit feedback.</p>
          </div>
        )}

        <div className="feedback-grid">
          <section className="chart-container feedback-card">
            <h2 className="feedback-title">Anonymous Feedback</h2>
            <p className="feedback-subtitle">
              Name and email are optional. Only your message matters.
            </p>

            {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}
            {success && (
              <div className="feedback-success-message">
                {success}
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Category</label>
                <select
                  value={form.category}
                  onChange={(e) => updateField('category', e.target.value)}
                  disabled={submitting}
                >
                  <option value="general">General</option>
                  <option value="bug">Bug Report</option>
                  <option value="feature">Feature Request</option>
                  <option value="ui">Design / UI</option>
                </select>
              </div>

              <div className="form-group">
                <label>Rating (1-5)</label>
                <select
                  value={form.rating}
                  onChange={(e) => updateField('rating', Number(e.target.value))}
                  disabled={submitting}
                >
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Message</label>
                <textarea
                  value={form.message}
                  onChange={(e) => updateField('message', e.target.value)}
                  required
                  disabled={submitting}
                  rows={5}
                  placeholder="What should we improve?"
                  className="feedback-textarea"
                />
              </div>

              <div className="form-group">
                <label>Contact (optional)</label>
                <input
                  type="text"
                  value={form.contact}
                  onChange={(e) => updateField('contact', e.target.value)}
                  disabled={submitting}
                  placeholder="Email or social handle"
                />
              </div>

              <div className="feedback-submit-row">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          </section>

          <section className="chart-container feedback-card">
            <h2 className="feedback-title">Connect Us</h2>
            <p className="feedback-subtitle">
              Reach out for collaboration, support, or suggestions.
            </p>

            <div className="feedback-contact-list">
              <a className="about-contact-link" href="mailto:habytarc@gmail.com">Email: habytarc@gmail.com</a>
            </div>

            <div className="feedback-privacy-note">
              <strong>Privacy note:</strong> feedback submissions are stored without your user identity by default.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Feedback;
