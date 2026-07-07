import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useUI } from '../context/UIContext.jsx';
import { useLive } from '../context/SocketContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export default function NewGroupModal() {
  const { closeNewGroup, triggerRefresh, openGroup } = useUI();
  const { toast } = useLive();
  const { departments: DEPTS } = useSettings();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', description: '', dept: DEPTS[0] || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Please give the group a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/groups', form);
      toast('Group created!');
      triggerRefresh();
      closeNewGroup();
      openGroup(data._id); // preselect the new group
      navigate('/groups'); // open the Groups page on it
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={closeNewGroup}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr">
          <div className="modal-title">Create a Group</div>
          <button className="close-btn" onClick={closeNewGroup}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="fg">
            <label>Group Name *</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Final Year AI Research Group"
            />
          </div>
          <div className="fg">
            <label>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="What is this group about?"
            />
          </div>
          <div className="fg">
            <label>Department</label>
            <select value={form.dept} onChange={(e) => set('dept', e.target.value)}>
              {DEPTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.25rem' }}>
            <button className="btn btn-ghost" style={{ fontWeight: 700 }} onClick={closeNewGroup} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Creating...' : 'Create Group →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
