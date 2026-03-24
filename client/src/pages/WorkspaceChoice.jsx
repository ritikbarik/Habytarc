import React from 'react';
import { Link } from 'react-router-dom';

function WorkspaceChoice() {
  return (
    <div className="page-container">
      <div className="page-content">
        <div className="workspace-choice-header">
          <span className="workspace-choice-eyebrow">One login, two focused products</span>
          <h1>Choose Your Space</h1>
          <p className="page-subtitle">Pick calm execution in HabytARC or switch into Zenvy for a more focused exam control center.</p>
        </div>

        <div className="workspace-choice-grid">
          <article className="workspace-choice-card workspace-choice-card-habytarc">
            <span className="workspace-choice-label">HabytARC</span>
            <h2>Habits, Tasks, and Daily Momentum</h2>
            <p>
              Use HabytARC for habits, to-dos, calendar tracking, stats, and AI guidance for your daily workflow.
            </p>
            <Link className="btn btn-primary" to="/habytarc/home">
              Open HabytARC
            </Link>
          </article>

          <article className="workspace-choice-card zenvy-card">
            <span className="workspace-choice-label">Zenvy</span>
            <h2>Zenvy: Your Exam Preparation Companion</h2>
            <p>
              Use Zenvy for subject-wise syllabus tracking, AI extraction, unit-based organization, and study material progress.
            </p>
            <Link className="btn btn-primary" to="/zenvy/exam-mode">
              Open Zenvy
            </Link>
          </article>
        </div>
      </div>
    </div>
  );
}

export default WorkspaceChoice;
