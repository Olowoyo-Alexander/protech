import { createContext, useContext, useCallback, useRef, useState } from 'react';

const ConfirmContext = createContext(null);
// Promise-based confirm/prompt dialog, themed and centered.
//   const confirm = useConfirm();
//   if (!(await confirm({ title, message, confirmText, danger }))) return;        // yes/no
//   const reason = await confirm({ prompt: true, ... }); if (reason === null) ...  // text input
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null);
  const [value, setValue] = useState('');
  const resolver = useRef(null);

  const confirm = useCallback((options = {}) => {
    setValue(options.defaultValue || '');
    setOpts(options);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result) => {
    setOpts(null);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(result);
  };

  // Cancel resolves to null for a prompt (so callers can tell "aborted"), false otherwise.
  const onCancel = () => close(opts?.prompt ? null : false);
  const onConfirm = () => close(opts?.prompt ? value : true);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div className="overlay confirm-overlay" onClick={onCancel}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">{opts.title || 'Are you sure?'}</div>
            {opts.message && <div className="confirm-msg">{opts.message}</div>}
            {opts.prompt && (
              <textarea
                className="confirm-input"
                autoFocus
                value={value}
                placeholder={opts.placeholder || ''}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
            <div className="confirm-actions">
              <button className="btn btn-ghost" style={{ fontWeight: 700 }} onClick={onCancel}>
                {opts.cancelText || 'Cancel'}
              </button>
              <button className={`btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
                {opts.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
