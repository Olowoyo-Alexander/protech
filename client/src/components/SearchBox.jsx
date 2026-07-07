import { useState, useEffect, useRef, useCallback } from 'react';

// Reusable search input with a one-click clear (✕) button and an optional
// "smart" autocomplete dropdown. Autocomplete is enabled by passing a `suggest`
// function: (term) => [{ key, label, sub?, icon?, onPick }] (sync or async).
// Suggestions are debounced, keyboard-navigable (↑/↓/Enter/Esc) and close on
// outside click. Without `suggest` it behaves as a plain input + clear button.
export default function SearchBox({
  value,
  onChange,
  onClear,
  onEnter,
  suggest,
  placeholder = 'Search…',
  className = '',
  wrapClassName = '',
  autoFocus = false,
  minChars = 2,
  debounce = 250,
  maxItems = 8,
}) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const reqId = useRef(0); // guards against out-of-order async responses

  const term = value.trim();

  // Debounced suggestion fetch.
  useEffect(() => {
    if (!suggest || term.length < minChars) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const res = (await suggest(term)) || [];
        if (id === reqId.current) {
          setItems(res.slice(0, maxItems));
          setActive(-1);
        }
      } catch {
        if (id === reqId.current) setItems([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, debounce);
    return () => clearTimeout(t);
  }, [term, suggest, minChars, debounce, maxItems]);

  // Close the dropdown on any outside click.
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const pick = useCallback((item) => {
    if (!item) return;
    setOpen(false);
    setActive(-1);
    item.onPick?.();
  }, []);

  const clear = () => {
    onClear?.();
    setItems([]);
    setOpen(false);
    setActive(-1);
  };

  const showDrop = open && term.length >= minChars && (loading || items.length > 0);

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (showDrop && active >= 0 && items[active]) {
        e.preventDefault();
        pick(items[active]);
      } else {
        onEnter?.(term);
        setOpen(false);
      }
    } else if (e.key === 'ArrowDown') {
      if (items.length) {
        e.preventDefault();
        setOpen(true);
        setActive((i) => (i + 1) % items.length);
      }
    } else if (e.key === 'ArrowUp') {
      if (items.length) {
        e.preventDefault();
        setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className={`search-box ${wrapClassName}`} ref={wrapRef}>
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {value && (
        <button
          type="button"
          className="search-clear"
          onClick={clear}
          title="Clear search"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
      {showDrop && (
        <ul className="search-suggest" role="listbox">
          {loading && items.length === 0 ? (
            <li className="search-suggest-hint">Searching…</li>
          ) : (
            items.map((it, i) => (
              <li
                key={it.key}
                role="option"
                aria-selected={i === active}
                className={`search-suggest-item ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus; fire before input blur
                  pick(it);
                }}
              >
                {it.icon && <span className="search-suggest-icon">{it.icon}</span>}
                <span className="search-suggest-text">
                  <span className="search-suggest-label">{it.label}</span>
                  {it.sub && <span className="search-suggest-sub">{it.sub}</span>}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
