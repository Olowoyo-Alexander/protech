import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';
import { DEPTS, SETS } from '../utils.js';

const SettingsContext = createContext(null);
export const useSettings = () => useContext(SettingsContext);

export function SettingsProvider({ children }) {
  // Default to the built-in constants until the live taxonomy loads.
  const [departments, setDepartments] = useState(DEPTS);
  const [sets, setSets] = useState(SETS);
  const [deptShorts, setDeptShorts] = useState({}); // { "Computer Science": "CSC" }

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/settings');
      if (data.departments?.length) setDepartments(data.departments);
      if (data.sets?.length) setSets(data.sets);
      setDeptShorts(data.deptShorts || {});
    } catch {
      /* fall back to constants */
    }
  }, []);

  // Public endpoint — load for every visitor, including logged-out ones (the
  // registration forms need the live department list too), not just once a
  // user is signed in.
  useEffect(() => {
    load();
  }, [load]);

  // A department's short form, or '' if none.
  const deptShort = useCallback((name) => deptShorts[name] || '', [deptShorts]);
  // Always prefer the abbreviation (used for every chart label); falls back to
  // the full name when no short form has been set for that department.
  const deptAbbr = useCallback((name) => deptShorts[name] || name, [deptShorts]);
  // A compact, space-conserving label: the short form when the full name is
  // longer than `maxLen` (and a short exists), otherwise the full name.
  const deptLabel = useCallback(
    (name, maxLen = 12) => {
      const s = deptShorts[name];
      return s && name && name.length > maxLen ? s : name;
    },
    [deptShorts]
  );

  return (
    <SettingsContext.Provider
      value={{ departments, sets, deptShorts, deptShort, deptAbbr, deptLabel, reload: load, setDepartments, setSets, setDeptShorts }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
