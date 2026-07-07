import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import Avatar from './Avatar.jsx';
import { HeartIcon, BookmarkIcon, StarIcon } from './Icons.jsx';
import { ROLE_LABELS, timeAgo, groupTheme, recoMeta, displayName } from '../utils.js';

export default function ProjectModal({ id }) {
  const { user } = useAuth();
  const { closeProject, triggerRefresh, openCollab, openProject } = useUI();
  const confirm = useConfirm();
  const [p, setP] = useState(null);
  const [comment, setComment] = useState('');
  const [contribution, setContribution] = useState('');
  const [editContribId, setEditContribId] = useState(null);
  const [editContribText, setEditContribText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Supervisor rating draft (a rating must be accompanied by a comment).
  const [rateVal, setRateVal] = useState(0);
  const [rateComment, setRateComment] = useState('');

  const load = () => api.get(`/projects/${id}`).then((r) => setP(r.data)).catch((e) => setError(e.message));
  useEffect(() => {
    load(); // eslint-disable-next-line
  }, [id]);

  // Any mutation updates the modal and signals lists to refresh.
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      const { data } = await fn();
      setP(data);
      triggerRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const postComment = async () => {
    if (!comment.trim()) return;
    await run(() => api.post(`/projects/${id}/comments`, { text: comment }));
    setComment('');
  };

  // Group draft: a member adds their contribution; an author/admin submits it.
  const postContribution = async () => {
    if (!contribution.trim()) return;
    await run(() => api.post(`/projects/${id}/contributions`, { text: contribution }));
    setContribution('');
  };
  const submitDraft = async () => {
    const ok = await confirm({
      title: 'Submit for review?',
      message: 'This sends the project to the supervisor. Everyone who contributed becomes a co-author.',
      confirmText: 'Submit',
    });
    if (!ok) return;
    await run(() => api.post(`/projects/${id}/submit`));
  };

  // Edit / remove your own contribution — only while the project is still a draft.
  const startEditContrib = (c) => {
    setEditContribId(c._id);
    setEditContribText(c.text);
  };
  const cancelEditContrib = () => {
    setEditContribId(null);
    setEditContribText('');
  };
  const saveEditContrib = async (c) => {
    if (!editContribText.trim()) return;
    await run(() => api.patch(`/projects/${id}/contributions/${c._id}`, { text: editContribText }));
    cancelEditContrib();
  };
  const removeContrib = async (c) => {
    const ok = await confirm({
      title: 'Remove contribution?',
      message: 'This removes it from the draft.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await run(() => api.delete(`/projects/${id}/contributions/${c._id}`));
  };

  // Supervisors only: submit a star rating, which requires a comment.
  const submitRating = async () => {
    if (!rateVal) {
      setError('Select a star rating first.');
      return;
    }
    if (!rateComment.trim()) {
      setError('A comment is required to rate this project.');
      return;
    }
    await run(() => api.post(`/projects/${id}/rate`, { value: rateVal, comment: rateComment }));
    setRateComment('');
  };

  const reject = async () => {
    const reason = await confirm({
      title: 'Reject this project?',
      message: 'The authors will be notified. You can add a reason below (optional).',
      prompt: true,
      placeholder: 'Reason for rejection (optional)',
      confirmText: 'Reject',
      danger: true,
    });
    if (reason === null) return; // cancelled
    await run(() => api.patch(`/projects/${id}/reject`, { reason }));
  };

  // Locking disables collaboration and hiding removes the project from the feed
  // — both ask for confirmation. Reversing them (unlock / show) does not.
  const toggleLock = async () => {
    if (!p.locked && !(await confirm({
      title: 'Lock collaboration?',
      message: 'No one will be able to collaborate on this project until you unlock it.',
      confirmText: 'Lock',
    }))) return;
    run(() => api.patch(`/projects/${id}/lock`));
  };
  const toggleVisibility = async () => {
    if (!p.hidden && !(await confirm({
      title: 'Hide from feed?',
      message: 'Students and guests will no longer see this project in the feed.',
      confirmText: 'Hide',
    }))) return;
    run(() => api.patch(`/projects/${id}/visibility`));
  };

  if (!p)
    return (
      <div className="overlay" onClick={closeProject}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-body">{error ? <div className="auth-error">{error}</div> : <div className="spinner" />}</div>
        </div>
      </div>
    );

  const isAuthor = p.authors?.some((a) => a._id === user._id);
  // Any student can build an improvement/extension of a published project —
  // unless the supervisor has locked it for collaboration.
  const canCollab = user.role === 'student' && p.status === 'approved' && !p.locked;
  // Rejected projects are closed to all engagement.
  const isRejected = p.status === 'rejected';
  // Awaiting approval — not public yet, so no one may engage with it.
  const isPending = p.status === 'pending';
  // A draft group project being built collaboratively (not yet submitted).
  const isDraft = p.status === 'draft';
  // Only supervisors can rate, and only once the project is approved.
  const canRate = user.role === 'supervisor' && p.status === 'approved';
  // Lock / visibility controls are for the supervisor responsible for it (the
  // approver, or the assigned supervisor when no approver is recorded) — or admin.
  const responsibleId = p.approvedBy?._id || p.supervisor?._id;
  const canManage =
    p.status === 'approved' &&
    (user.role === 'admin' || (user.role === 'supervisor' && responsibleId === user._id));

  return (
    <div className="overlay" onClick={closeProject}>
      <div
        className={`modal ${recoMeta(p) ? `reco-skin-${recoMeta(p).key}` : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-hdr">
          <div className="modal-title">{p.title}</div>
          <button className="close-btn" onClick={closeProject}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="proj-meta">
            <span className="tag tag-dept">{p.dept}</span>
            <span className="tag tag-set">{p.set}</span>
            {p.status !== 'approved' && <span className={`tag tag-${p.status}`}>{p.status}</span>}
            {p.group && (
              <span
                className="tag group-badge"
                style={{ background: groupTheme(p.group.theme).bg, color: groupTheme(p.group.theme).fg }}
              >
                👥 Group · {p.group.name}
              </span>
            )}
            {p.authors?.length > 1 && <span className="collab-badge">👥 Collaboration</span>}
            {recoMeta(p) && (
              <span className={`reco-badge tier-${recoMeta(p).key}`}>
                {recoMeta(p).emoji} {recoMeta(p).label}
              </span>
            )}
            {p.spotlightRecommended && <span className="spotlight-badge">⭐ Spotlight</span>}
            {p.hidden && <span className="state-badge">🙈 Hidden</span>}
          </div>

          {/* When the supervisor is also an author (they published their own
              work), the "Supervisor:" line is redundant — the byline already
              shows their title + name — so it's hidden. */}
          {p.supervisor && !p.authors?.some((a) => a._id === p.supervisor._id) && (
            <div className="supervisor-line">
              <Avatar user={p.supervisor} size={20} />
              <span>
                Supervisor: <b>{displayName(p.supervisor)}</b>
              </span>
            </div>
          )}

          {p.chainTotal > 1 ? (
            // This project is part of a collaboration chain — show the lineage
            // (original → … → latest) so it's clear who came first and where
            // this project sits. Click any earlier/later step to open it.
            <div className="collab-chain" style={{ margin: '.75rem 0' }}>
              <div className="chain-head">
                👥 Collaboration chain · this project is{' '}
                <b>#{p.chainPosition} of {p.chainTotal}</b>
              </div>
              <ol className="chain-list">
                {p.chain?.map((step, i) => (
                  <li key={step._id} className={`chain-step${step.current ? ' current' : ''}`}>
                    <span className="chain-num">{i + 1}</span>
                    <div className="chain-body">
                      <div className="chain-authors">
                        {step.authors?.map((a) => (
                          <span key={a._id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Avatar user={a} size={20} /> {a.name}
                          </span>
                        ))}
                      </div>
                      <div className="chain-meta">
                        {step.current ? (
                          <span className="chain-title">{step.title}</span>
                        ) : (
                          <span className="chain-title link" onClick={() => openProject(step._id)}>
                            {step.title}
                          </span>
                        )}
                        {i === 0 && <span className="chain-tag">original</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : p.authors?.length > 1 ? (
            // Multiple people worked on this single project — list the
            // contributors in the order they joined, so #1 is the original
            // author and the rest are collaborators in sequence.
            <div className="collab-chain" style={{ margin: '.75rem 0' }}>
              <div className="chain-head">
                👥 Collaboration · <b>{p.authors.length} contributors</b>
              </div>
              <ol className="chain-list">
                {p.authors.map((a, i) => (
                  <li key={a._id} className={`chain-step${a._id === user._id ? ' current' : ''}`}>
                    <span className="chain-num">{i + 1}</span>
                    <div className="chain-body">
                      <div className="chain-authors">
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Avatar user={a} size={20} /> {a.name}
                        </span>
                      </div>
                      <div className="chain-meta">
                        <span className="chain-title">{ROLE_LABELS[a.role]}</span>
                        {i === 0 && <span className="chain-tag">group leader</span>}
                        {i > 0 && <span className="chain-tag">collaborator</span>}
                        {i > 0 && a._id === user._id && <span className="chain-tag here">you</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="author-line" style={{ margin: '.75rem 0' }}>
              {p.authors?.map((a) => (
                <span key={a._id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Avatar user={a} size={22} /> {displayName(a)}
                </span>
              ))}
            </div>
          )}

          {p.extends && (
            <div className="role-info" style={{ marginBottom: '.5rem' }}>
              🔗 Improvement of{' '}
              <span
                style={{ color: 'var(--blue)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => openProject(p.extends._id)}
              >
                {p.extends.title}
              </span>
            </div>
          )}

          {p.status === 'rejected' && p.rejectionReason && (
            <div className="role-info" style={{ color: '#991b1b', background: '#fee2e2' }}>
              Rejected: {p.rejectionReason}
            </div>
          )}

          <div className="sec-h">Abstract</div>
          <div className="prose">{p.summary}</div>
          <div className="sec-h">Problem Statement</div>
          <div className="prose">{p.problem}</div>
          <div className="sec-h">Methodology</div>
          <div className="prose">{p.methodology}</div>
          {p.limitations && (
            <>
              <div className="sec-h">Limitations</div>
              <div className="prose">{p.limitations}</div>
            </>
          )}
          {p.docName && (
            <>
              <div className="sec-h doc-head">
                <span>Documentation</span>
                {p.docUrl && (
                  <span className="doc-actions">
                    <a href={p.docUrl} target="_blank" rel="noreferrer">↗ Open in new tab</a>
                    <a href={p.docUrl.replace('/upload/', '/upload/fl_attachment/')}>⬇ Download</a>
                  </span>
                )}
              </div>
              {p.docUrl ? (
                p.docName.toLowerCase().endsWith('.pdf') ? (
                  // PDFs preview inline in the browser's built-in viewer.
                  <iframe className="doc-viewer" src={p.docUrl} title={p.docName} />
                ) : (
                  // Non-PDF types (DOCX, etc.) can't be previewed reliably in-browser,
                  // so we surface the file with open/download actions instead.
                  <div className="doc-fallback">
                    📄 {p.docName}
                    <span className="doc-muted"> — inline preview is available for PDFs; use the actions above to open or download.</span>
                  </div>
                )
              ) : (
                <div className="doc-fallback doc-muted">📄 {p.docName} (file not available)</div>
              )}
            </>
          )}

          {/* Who did what — each group member's part/role, kept on the project
              after it's submitted (the editable version lives in the draft panel). */}
          {!isDraft && p.contributions?.length > 0 && (
            <>
              <div className="sec-h">Contributions</div>
              <div className="comment-list">
                {p.contributions.map((c) => (
                  <div className="comment" key={c._id}>
                    <Avatar user={c.user} size={28} />
                    <div style={{ flex: 1 }}>
                      <div className="comment-meta">
                        <span className="comment-author">{displayName(c.user)}</span>
                        <span className="comment-time">{timeAgo(c.createdAt)}</span>
                      </div>
                      <div className="comment-text">{c.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {isDraft && (
            <div className="draft-panel">
              <div className="draft-panel-hd">
                <span className="draft-badge">✎ Draft</span>
              </div>

              <div className="sec-h">Contributions ({p.contributionCount || 0})</div>
              <div className="comment-list">
                {p.contributions?.length ? (
                  p.contributions.map((c) => {
                    const mine = c.user?._id === user._id;
                    const editing = editContribId === c._id;
                    return (
                      <div className="comment" key={c._id}>
                        <Avatar user={c.user} size={28} />
                        <div style={{ flex: 1 }}>
                          <div className="comment-meta">
                            <span className="comment-author">{displayName(c.user)}</span>
                            <span className="comment-time">{timeAgo(c.createdAt)}</span>
                            {mine && !editing && (
                              <span className="contrib-actions">
                                <button className="contrib-link" onClick={() => startEditContrib(c)}>Edit</button>
                                <button className="contrib-link danger" onClick={() => removeContrib(c)}>Remove</button>
                              </span>
                            )}
                          </div>
                          {editing ? (
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                              <input
                                className="contrib-edit-input"
                                value={editContribText}
                                onChange={(e) => setEditContribText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && saveEditContrib(c)}
                                autoFocus
                              />
                              <button className="btn btn-primary btn-sm" disabled={busy || !editContribText.trim()} onClick={() => saveEditContrib(c)}>Save</button>
                              <button className="btn btn-ghost btn-sm" onClick={cancelEditContrib}>Cancel</button>
                            </div>
                          ) : (
                            <div className="comment-text">{c.text}</div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--textmuted)' }}>No contributions yet.</div>
                )}
              </div>

              {p.canContribute && (
                <div style={{ display: 'flex', gap: 8, marginTop: '.5rem' }}>
                  <input
                    placeholder="The part or role you played (e.g. Frontend development)"
                    style={{ flex: 1, padding: '9px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
                    value={contribution}
                    onChange={(e) => setContribution(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && postContribution()}
                  />
                  <button className="btn btn-primary btn-sm" disabled={busy || !contribution.trim()} onClick={postContribution}>
                    Add
                  </button>
                </div>
              )}

              {p.canSubmitDraft && (
                <div style={{ marginTop: '.75rem' }}>
                  <button className="btn btn-success btn-sm" disabled={busy} onClick={submitDraft}>
                    ✓ Submit for review
                  </button>
                </div>
              )}
            </div>
          )}

          {isRejected ? (
            <div className="role-info" style={{ color: '#991b1b', background: '#fee2e2', marginTop: '.75rem' }}>
              🚫 This project was rejected — likes, saves, ratings, comments and collaboration are disabled.
            </div>
          ) : isPending ? null : isDraft ? null : (
            <>
              <div className="sec-h">Engagement</div>
              <div className="eng-row" style={{ marginBottom: '.75rem' }}>
                <button className={`eng-btn act-like ${p.liked ? 'liked' : ''}`} disabled={busy} onClick={() => run(() => api.post(`/projects/${id}/like`))}>
                  <span className="eng-ic"><HeartIcon filled={p.liked} /></span> {p.likeCount} Likes
                </button>
                <button className={`eng-btn act-save ${p.bookmarked ? 'saved' : ''}`} disabled={busy} onClick={() => run(() => api.post(`/projects/${id}/bookmark`))}>
                  <span className="eng-ic"><BookmarkIcon filled={p.bookmarked} /></span> {p.bookmarkCount} Saves
                </button>
                <span className="eng-btn"><span className="eng-ic"><StarIcon /></span> {p.avgRating || 'No ratings'}</span>
                <span className="eng-stars" style={{ marginLeft: 'auto' }} title="Stars earned"><StarIcon size={14} filled /> {p.gold}</span>
              </div>
            </>
          )}

          {canRate && (
            <>
              <div className="sec-h">Rate this project</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: '.5rem' }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    className={`star-btn ${s <= (rateVal || p.myRating) ? 'on' : ''}`}
                    disabled={busy}
                    onClick={() => setRateVal(s)}
                  >
                    ★
                  </button>
                ))}
                {(rateVal || p.myRating) ? (
                  <span style={{ fontSize: 12, color: 'var(--textmuted)', marginLeft: 8 }}>
                    {rateVal ? `${rateVal}/5` : `${p.myRating}/5 (current)`}
                  </span>
                ) : null}
              </div>
              <textarea
                placeholder="Add a comment explaining your rating (required)..."
                style={{ width: '100%', minHeight: 60, padding: '9px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', marginBottom: '.5rem' }}
                value={rateComment}
                onChange={(e) => setRateComment(e.target.value)}
              />
              <div style={{ marginBottom: '.75rem' }}>
                <button className="btn btn-primary btn-sm" disabled={busy || !rateVal || !rateComment.trim()} onClick={submitRating}>
                  {p.myRating ? 'Update Rating' : 'Submit Rating'}
                </button>
              </div>
            </>
          )}

          {user.role === 'student' && p.status === 'approved' && (
            <div style={{ marginBottom: '.75rem' }}>
              <button className="btn btn-primary btn-sm" disabled={busy || p.locked} onClick={() => openCollab(p)}>
                👥 Collaboration
              </button>
              <span style={{ fontSize: 11, color: 'var(--textmuted)', marginLeft: 8 }}>
                {p.locked ? 'locked' : 'Add contribution'}
              </span>
            </div>
          )}

          {user.role === 'supervisor' && p.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: '.75rem' }}>
              <button className="btn btn-success btn-sm" disabled={busy} onClick={() => run(() => api.patch(`/projects/${id}/approve`))}>
                ✓ Approve
              </button>
              <button className="btn btn-danger btn-sm" disabled={busy} onClick={reject}>
                ✗ Reject
              </button>
            </div>
          )}

          {canManage && (
            <div style={{ display: 'flex', gap: 8, marginBottom: '.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-amber btn-sm" disabled={busy} onClick={toggleLock}>
                {p.locked ? '🔓 Unlock collaboration' : '🔒 Lock collaboration'}
              </button>
              <button className="btn btn-amber btn-sm" disabled={busy} onClick={toggleVisibility}>
                {p.hidden ? '👁 Show on feed' : '🙈 Hide from feed'}
              </button>
            </div>
          )}

          {/* Once a project reaches Gold recognition, any supervisor may
              recommend it for the spotlight (or withdraw their recommendation). */}
          {user.role === 'supervisor' && p.spotlightEligible && (
            <div style={{ marginBottom: '.75rem' }}>
              <button
                className={`btn btn-sm ${p.spotlightRecommended ? 'btn-outline' : 'btn-primary'}`}
                disabled={busy}
                onClick={() => run(() => api.post(`/projects/${id}/spotlight`))}
              >
                {p.spotlightRecommended ? '⭐ Recommended for spotlight — withdraw' : '⭐ Recommend for spotlight'}
              </button>
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          {p.extensions?.length > 0 && (
            <>
              <div className="sec-h">Collaborators ({p.extensions.length})</div>
              <div className="comment-list">
                {p.extensions.map((e) => (
                  <div className="comment" key={e._id} style={{ cursor: 'pointer' }} onClick={() => openProject(e._id)}>
                    <div style={{ flex: 1 }}>
                      <div className="comment-meta">
                        <span className="comment-author">🔗 {e.title}</span>
                        {e.status !== 'approved' && (
                          <span className={`tag tag-${e.status}`} style={{ fontSize: 9 }}>
                            {e.status}
                          </span>
                        )}
                        <span className="comment-time">{timeAgo(e.createdAt)}</span>
                      </div>
                      <div className="comment-text">by {e.authors?.map((a) => a.name).join(', ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!isDraft && (
          <>
          <div className="sec-h">Comments ({p.commentCount})</div>
          <div className="comment-list">
            {p.comments?.map((c) => (
              <div className="comment" key={c._id}>
                <Avatar user={c.user} size={28} />
                <div style={{ flex: 1 }}>
                  <div className="comment-meta">
                    <span className="comment-author">{displayName(c.user)}</span>
                    <span className={`role-badge rb-${c.user?.role}`} style={{ fontSize: 9 }}>
                      {ROLE_LABELS[c.user?.role]}
                    </span>
                    <span className="comment-time">{timeAgo(c.createdAt)}</span>
                  </div>
                  <div className="comment-text">{c.text}</div>
                </div>
              </div>
            ))}
            {!p.comments?.length && <div style={{ fontSize: 12, color: 'var(--textmuted)' }}>No comments yet.</div>}
          </div>

          {p.status === 'approved' && (
            <div style={{ display: 'flex', gap: 8, marginTop: '.875rem' }}>
              <input
                placeholder="Write a comment..."
                style={{ flex: 1, padding: '9px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && postComment()}
              />
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={postComment}>
                Post
              </button>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
