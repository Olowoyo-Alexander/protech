import asyncHandler from 'express-async-handler';
import { getSettings } from '../models/Settings.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import Group from '../models/Group.js';

// A department short form is at least three uppercase letters (e.g. CSC, ENGR).
const SHORT_RE = /^[A-Z]{3,}$/;

// Academic sets are kept in chronological order (e.g. 2018/2019 before
// 2024/2025) regardless of when each was added. Sorted by the first year in
// the label; entries without a year sort last, alphabetically.
const setYear = (s) => {
  const m = String(s).match(/\d{4}/);
  return m ? Number(m[0]) : Infinity;
};
export const sortSets = (sets) =>
  [...sets].sort((a, b) => setYear(a) - setYear(b) || String(a).localeCompare(String(b)));

// Serialize the settings doc for the client (Map → plain object).
const shape = (s) => ({
  departments: s.departments,
  sets: sortSets(s.sets),
  deptShorts: s.deptShorts ? Object.fromEntries(s.deptShorts) : {},
});

// GET /api/settings  — public taxonomy used to populate forms
export const readSettings = asyncHandler(async (req, res) => {
  const s = await getSettings();
  res.json(shape(s));
});

// PUT /api/admin/settings  { departments, sets, deptShorts }  (admin)
export const updateSettings = asyncHandler(async (req, res) => {
  const s = await getSettings();
  const clean = (arr) =>
    Array.isArray(arr) ? [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))] : undefined;

  const departments = clean(req.body.departments);
  const sets = clean(req.body.sets);

  // Cascade department renames: every project, user and group that stored the
  // old department name is updated to the new one, so a rename reflects across
  // the whole platform (feeds, filters, dashboards, analytics, scoping).
  const renames = Array.isArray(req.body.renames) ? req.body.renames : [];
  for (const r of renames) {
    const from = String(r?.from || '').trim();
    const to = String(r?.to || '').trim();
    if (!from || !to || from === to) continue;
    await Promise.all([
      Project.updateMany({ dept: from }, { $set: { dept: to } }),
      User.updateMany({ dept: from }, { $set: { dept: to } }),
      Group.updateMany({ dept: from }, { $set: { dept: to } }),
    ]);
  }

  if (departments) s.departments = departments;
  if (sets) s.sets = sortSets(sets);

  // Short forms: keep only valid ones (≥3 uppercase letters) that belong to a
  // current department. Rebuilt from scratch each save so renamed/removed
  // departments don't leave orphaned shorts behind.
  if (req.body.deptShorts && typeof req.body.deptShorts === 'object') {
    const names = new Set(s.departments);
    const next = {};
    for (const [name, raw] of Object.entries(req.body.deptShorts)) {
      const short = String(raw || '').trim().toUpperCase();
      if (names.has(name) && SHORT_RE.test(short)) next[name] = short;
    }
    s.deptShorts = next;
  }

  await s.save();
  res.json(shape(s));
});
