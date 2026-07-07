import { useState } from 'react';
import api from '../api/client.js';
import { useSettings } from '../context/SettingsContext.jsx';

const SHORT_RE = /^[A-Z]{3,}$/;

// Departments editor: each row is a department name paired with an optional
// short form (≥3 uppercase letters) used as a compact alias, e.g. CSC.
function DeptEditor({ rows, setRows }) {
  const update = (i, key, val) => setRows(rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  const remove = (i) => setRows(rows.filter((_, idx) => idx !== i));
  const add = () => setRows([...rows, { name: '', short: '' }]);
  return (
    <div className="section-card">
      <div className="section-title">Departments <span className="pill">{rows.length}</span></div>
      <div className="dept-editor">
        {rows.map((r, i) => {
          const badShort = r.short.length > 0 && !SHORT_RE.test(r.short);
          return (
            <div className="dept-row" key={i}>
              <input
                className="dept-name"
                placeholder="Department name"
                value={r.name}
                onChange={(e) => update(i, 'name', e.target.value)}
              />
              <input
                className={`dept-short ${badShort ? 'bad' : ''}`}
                placeholder="CSC"
                value={r.short}
                maxLength={8}
                onChange={(e) => update(i, 'short', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              />
              <button className="dept-del" onClick={() => remove(i)} title="Remove" aria-label="Remove department">
                ×
              </button>
            </div>
          );
        })}
        {rows.length === 0 && <div style={{ fontSize: 12, color: 'var(--textmuted)' }}>None yet.</div>}
      </div>
      <button className="dept-add-btn" onClick={add} title="Add department" aria-label="Add department">
        <i className="bi bi-plus-lg" />
      </button>
    </div>
  );
}

function TagEditor({ title, items, onAdd, onRemove }) {
  const [value, setValue] = useState('');
  const add = () => {
    const v = value.trim();
    if (v && !items.includes(v)) onAdd(v);
    setValue('');
  };
  return (
    <div className="section-card">
      <div className="section-title">{title} <span className="pill">{items.length}</span></div>
      <div className="tag-input-row">
        <input placeholder={`Add a ${title.toLowerCase().replace(/s$/, '')}...`} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn btn-primary btn-sm" onClick={add}>+ Add</button>
      </div>
      <div>
        {items.map((it) => (
          <span className="tag-chip" key={it}>
            {it}
            <button onClick={() => onRemove(it)} title="Remove">×</button>
          </span>
        ))}
        {items.length === 0 && <div style={{ fontSize: 12, color: 'var(--textmuted)' }}>None yet.</div>}
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const { departments, sets, deptShorts, setDepartments, setSets, setDeptShorts, reload } = useSettings();
  // `orig` remembers each row's name as loaded, so a rename can be detected and
  // cascaded to every project/user/group that references the old name.
  const [deptRows, setDeptRows] = useState(() => departments.map((name) => ({ name, short: deptShorts[name] || '', orig: name })));
  const [yrs, setYrs] = useState(sets);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError('');
    setMsg('');
    // Every short form present must be at least three uppercase letters.
    if (deptRows.some((r) => r.short.length > 0 && !SHORT_RE.test(r.short))) {
      setError('A department short form must be at least three uppercase letters (e.g. CSC).');
      return;
    }
    const names = [...new Set(deptRows.map((r) => r.name.trim()).filter(Boolean))];
    const shorts = {};
    deptRows.forEach((r) => {
      const n = r.name.trim();
      if (n && SHORT_RE.test(r.short)) shorts[n] = r.short;
    });
    // Renamed rows (had an original name that changed) — sent so the server can
    // update every project/user/group that used the old department name.
    const renames = deptRows
      .filter((r) => r.orig && r.name.trim() && r.orig !== r.name.trim())
      .map((r) => ({ from: r.orig, to: r.name.trim() }));
    setBusy(true);
    try {
      const { data } = await api.put('/admin/settings', { departments: names, sets: yrs, deptShorts: shorts, renames });
      setDepartments(data.departments);
      setSets(data.sets);
      setDeptShorts(data.deptShorts || {});
      setDeptRows(data.departments.map((name) => ({ name, short: (data.deptShorts || {})[name] || '', orig: name })));
      setYrs(data.sets);
      reload();
      setMsg('Settings saved. Department renames now reflect everywhere they’re used.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="dash-head">
        <div className="page-title" style={{ margin: 0 }}>⚙ Platform Settings</div>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {msg && <div className="auth-ok" style={{ marginBottom: 8 }}>{msg}</div>}
      {error && <div className="auth-error" style={{ marginBottom: 8 }}>{error}</div>}

      <div className="two-col">
        <DeptEditor rows={deptRows} setRows={setDeptRows} />
        <TagEditor
          title="Academic Sets"
          items={yrs}
          onAdd={(v) => setYrs([...yrs, v])}
          onRemove={(v) => setYrs(yrs.filter((x) => x !== v))}
        />
      </div>
    </>
  );
}
