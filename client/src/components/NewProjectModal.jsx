import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useUI } from '../context/UIContext.jsx';
import { useLive } from '../context/SocketContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { displayName } from '../utils.js';

const EMPTY = {
  title: '',
  summary: '',
  problem: '',
  methodology: '',
  limitations: '',
  dept: 'Computer Science',
  set: '2022/2023',
};

export default function NewProjectModal() {
  const { closeNew, triggerRefresh, collabProject, openProject, projectGroupId } = useUI();
  const { toast } = useLive();
  const { departments: DEPTS, sets: SETS } = useSettings();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Supervisors submitting their own work don't need to tag another supervisor.
  const isSupervisor = user?.role === 'supervisor';
  // In collaborate mode the form starts blank. Submitting creates a NEW
  // standalone project that links back to the original (an "extension") — the
  // original is untouched.
  const isCollab = !!collabProject;
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Supervisor tagging: the student enters the supervisor's exclusive tag — the
  // only way to tag a supervisor. The tag is resolved (debounced) to a real
  // supervisor; `supMatch` holds the resolved supervisor (or null).
  const [supTag, setSupTag] = useState('');
  const [supMatch, setSupMatch] = useState(null);
  const [supChecking, setSupChecking] = useState(false);

  // A project is attached to a group only when the form was opened from within a
  // group (its "New project" button presets the group); there's no manual picker.
  const groupId = projectGroupId || '';
  // Group projects can be saved as a draft so members contribute before submit.
  const [saveAsDraft, setSaveAsDraft] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Collaborate mode only: close this form and reopen the project being
  // collaborated on (the detail dialog was closed when collab opened).
  const backToProject = () => {
    const id = collabProject?._id;
    closeNew();
    if (id) openProject(id);
  };

  // Resolve the typed supervisor tag to a real supervisor (debounced).
  useEffect(() => {
    const t = supTag.trim();
    if (t.length < 3) {
      setSupMatch(null);
      setSupChecking(false);
      return;
    }
    setSupChecking(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/users/supervisor-by-tag', { params: { tag: t } });
        setSupMatch(data || null);
      } catch {
        setSupMatch(null);
      } finally {
        setSupChecking(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [supTag]);

  const submit = async () => {
    if (!form.title || !form.summary || !form.problem || !form.methodology) {
      setError('Please fill in all required fields (*).');
      return;
    }
    if (!isSupervisor && !supMatch) {
      setError("Please enter your supervisor's valid tag to tag them.");
      return;
    }
    const asDraft = !!groupId && saveAsDraft;
    // A draft is built up from members' text contributions first; the
    // document is attached later, before it's actually submitted for review.
    if (!file && !asDraft) {
      setError('Please attach a documentation file — it is required to submit.');
      return;
    }
    const ok = await confirm({
      title: asDraft ? 'Save group draft?' : isCollab ? 'Submit collaboration?' : 'Submit project?',
      message: asDraft
        ? 'Group members can add their contributions before you submit it for review.'
        : 'Your submission will be sent to the supervisor for review.',
      confirmText: asDraft ? 'Save draft' : 'Submit',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('document', file);
      // Students tag their supervisor by tag (supervisors self-supervise).
      if (!isSupervisor) fd.append('supervisorTag', supTag.trim());
      if (groupId) fd.append('group', groupId);
      if (asDraft) fd.append('saveAsDraft', 'true');
      // Link the new project back to the original it improves on.
      if (isCollab) fd.append('extends', collabProject._id);
      await api.post('/projects', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast(asDraft ? 'Draft saved — group members can now contribute.' : isCollab ? 'Collaboration submitted for review!' : 'Project submitted for review!');
      triggerRefresh();
      closeNew();
      if (!asDraft) navigate('/my-projects');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={closeNew}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr">
          <div className="modal-title">{isCollab ? 'Collaborate on Project' : 'Submit New Project'}</div>
          <button className="close-btn" onClick={closeNew}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="fg">
            <label>Project Title *</label>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="A clear, descriptive title" />
          </div>
          <div className="fg">
            <label>Summary / Abstract *</label>
            <textarea value={form.summary} onChange={(e) => set('summary', e.target.value)} placeholder="Brief overview of the project and its goals..." />
          </div>
          <div className="fg">
            <label>Problem Addressed *</label>
            <textarea value={form.problem} onChange={(e) => set('problem', e.target.value)} placeholder="What specific problem does this project solve?" />
          </div>
          <div className="fg">
            <label>Methodology *</label>
            <textarea value={form.methodology} onChange={(e) => set('methodology', e.target.value)} placeholder="Tools, frameworks, techniques, and approach used..." />
          </div>
          <div className="form-row">
            <div className="fg">
              <label>Department</label>
              <select value={form.dept} onChange={(e) => set('dept', e.target.value)}>
                {DEPTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="fg">
              <label>Academic Set</label>
              <select value={form.set} onChange={(e) => set('set', e.target.value)}>
                {SETS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          {isSupervisor ? (
            <div className="role-info" style={{ marginBottom: '1rem' }}>
              🧑‍🏫 You’ll be listed as the supervisor on this project — no need to tag anyone.
            </div>
          ) : (
            <div className="fg">
              <label>Supervisor Tag *</label>
              <input
                value={supTag}
                onChange={(e) => setSupTag(e.target.value.replace(/\s/g, ''))}
                placeholder="Enter your supervisor’s tag (e.g. okonkwo42)"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              {supTag.trim().length >= 3 && (
                <div className="sup-tag-resolve">
                  {supChecking ? (
                    <span className="str-checking">Checking…</span>
                  ) : supMatch ? (
                    <span className="str-ok">
                      ✓ {displayName(supMatch)}
                      {supMatch.dept ? ` · ${supMatch.dept}` : ''}
                    </span>
                  ) : (
                    <span className="str-bad">No supervisor found with that tag</span>
                  )}
                </div>
              )}
              <div className="field-help">
                Ask your supervisor for their tag — it’s the only way to tag them.
              </div>
            </div>
          )}
          <div className="fg">
            <label>Limitations</label>
            <textarea value={form.limitations} onChange={(e) => set('limitations', e.target.value)} placeholder="Known limitations or scope boundaries..." />
          </div>
          {groupId && (
            <label className="draft-toggle">
              <input type="checkbox" checked={saveAsDraft} onChange={(e) => setSaveAsDraft(e.target.checked)} />
              <span>
                <b>Save as group draft</b>
                <span className="draft-toggle-sub">Let group members add their contributions before you submit it for review.</span>
              </span>
            </label>
          )}
          <div className="fg">
            <label>Documentation {groupId && saveAsDraft ? '(optional for a draft)' : '*'}</label>
            <label className={`file-lbl ${file ? 'has-file' : ''}`}>
              📄 {file
                ? file.name
                : groupId && saveAsDraft
                ? 'Click to attach a document (PDF, DOCX, etc.) — or add it before submitting'
                : 'Click to attach a document (PDF, DOCX, etc.) — required'}
              <input type="file" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files[0] || null)} />
            </label>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.25rem' }}>
            {isCollab && (
              <button className="btn btn-ghost" style={{ fontWeight: 700 }} onClick={backToProject} disabled={busy}>
                ← Back to Project
              </button>
            )}
            <button className="btn btn-ghost" style={{ fontWeight: 700 }} onClick={closeNew} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy
                ? 'Submitting...'
                : groupId && saveAsDraft
                ? 'Save Draft →'
                : isCollab
                ? 'Submit Collaboration →'
                : 'Submit for Review →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
