import mongoose from 'mongoose';

// Single document holding platform-wide, admin-editable taxonomy.
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    departments: { type: [String], default: [] },
    // Optional short form per department (e.g. "Computer Science" → "CSC"), used
    // as a compact, space-saving alias — notably as chart labels when the full
    // name is too long. Keyed by the exact department name; ≥3 uppercase letters.
    deptShorts: { type: Map, of: String, default: {} },
    sets: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const DEFAULT_DEPARTMENTS = [
  'Computer Science',
  'Engineering',
  'Business',
  'Medicine',
  'Law',
  'Education',
  'Sciences',
];
export const DEFAULT_SETS = ['2020/2021', '2021/2022', '2022/2023', '2023/2024', '2024/2025'];

const Settings = mongoose.model('Settings', settingsSchema);

// Fetch the singleton, creating it with defaults on first use.
export async function getSettings() {
  let doc = await Settings.findOne({ key: 'global' });
  if (!doc) {
    doc = await Settings.create({
      key: 'global',
      departments: DEFAULT_DEPARTMENTS,
      sets: DEFAULT_SETS,
    });
  }
  return doc;
}

export default Settings;
