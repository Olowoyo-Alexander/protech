import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { startEmbeddedMongo, stopEmbeddedMongo } from '../config/embeddedMongo.js';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Notification from '../models/Notification.js';
import Message from '../models/Message.js';
import Settings, { DEFAULT_DEPARTMENTS, DEFAULT_SETS } from '../models/Settings.js';

const AV = ['av-amber', 'av-blue', 'av-green', 'av-red', 'av-purple'];
const color = (n) => AV[Math.abs([...n].reduce((a, c) => a + c.charCodeAt(0), 0)) % AV.length];

async function seed() {
  if (process.env.USE_EMBEDDED_DB === 'true') {
    process.env.MONGO_URI = await startEmbeddedMongo();
  }
  await connectDB();
  console.log('Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    Project.deleteMany({}),
    Notification.deleteMany({}),
    Message.deleteMany({}),
    Settings.deleteMany({}),
  ]);

  console.log('Creating platform settings...');
  await Settings.create({ key: 'global', departments: DEFAULT_DEPARTMENTS, sets: DEFAULT_SETS });

  console.log('Creating users...');
  const usersData = [
    { name: 'System Admin', email: 'admin@prostech.edu', role: 'admin', dept: '', set: '', verified: true },
    { name: 'Dr. Sarah Okonkwo', email: 's.okonkwo@uni.edu', role: 'supervisor', dept: 'Computer Science', set: '', verified: true },
    { name: 'Chukwuemeka Adeyemi', email: 'c.adeyemi@stu.edu', role: 'student', dept: 'Computer Science', set: '2022/2023', matric: 'CSC/22/001' },
    { name: 'Fatima Al-Hassan', email: 'f.alhassan@stu.edu', role: 'student', dept: 'Engineering', set: '2023/2024', matric: 'ENG/23/014' },
    { name: 'Kwame Boateng', email: 'k.boateng@stu.edu', role: 'student', dept: 'Business', set: '2021/2022', matric: 'BUS/21/007' },
    { name: 'Guest User', email: 'guest@view.edu', role: 'observer', dept: '', set: '' },
  ];
  const users = [];
  for (const u of usersData) {
    const doc = await User.create({ ...u, password: 'demo123', avatarColor: color(u.name) });
    users.push(doc);
  }
  const [, sup, cs, eng, biz] = users;

  console.log('Creating projects...');
  const projectsData = [
    {
      title: 'Smart Waste Management via IoT Sensors',
      summary: 'An IoT-based system to monitor fill levels in campus waste bins, routing collection trucks optimally to reduce fuel use and emissions across the university campus.',
      problem: 'Campus waste overflow and inefficient collection scheduling causing environmental issues.',
      methodology: 'Arduino sensors + LoRa network + real-time dashboard for supervisors and facilities staff.',
      limitations: 'Limited to on-campus deployment; requires infrastructure investment.',
      dept: 'Engineering', set: '2023/2024', authors: [eng._id], supervisor: sup._id, status: 'approved',
      likes: [cs._id], ratings: [{ user: sup._id, value: 5, weight: 1.5 }, { user: cs._id, value: 4, weight: 1 }],
      comments: [{ user: sup._id, text: 'Outstanding work! Highly recommend for institutional adoption.' }],
    },
    {
      title: 'AI-Powered Student Performance Predictor',
      summary: 'Machine learning model predicting academic outcomes early, enabling timely interventions for at-risk students using anonymised historical grade data.',
      problem: 'High failure and dropout rates due to late identification of struggling students.',
      methodology: 'Random forest classifier trained on 3 years of anonymised grade records with SMOTE balancing.',
      limitations: 'Dependent on data quality; potential demographic bias in training data.',
      dept: 'Computer Science', set: '2022/2023', authors: [cs._id], supervisor: sup._id, status: 'approved',
      docName: 'research_paper.pdf',
      likes: [eng._id, biz._id], bookmarks: [eng._id],
      ratings: [{ user: sup._id, value: 5, weight: 1.5 }, { user: eng._id, value: 4, weight: 1 }, { user: biz._id, value: 4, weight: 1 }],
      comments: [
        { user: eng._id, text: 'Really innovative approach! Did you consider neural networks for this?' },
        { user: sup._id, text: 'Excellent methodology. The SMOTE balancing was a smart choice.' },
      ],
    },
    {
      title: 'Fintech Microfinance App for Students',
      summary: 'Mobile application enabling peer-to-peer micro-loans among verified students with transparent repayment tracking and algorithmic credit scoring.',
      problem: 'Students lack access to emergency funds and small credit facilities from formal institutions.',
      methodology: 'Flutter cross-platform app with Firebase backend and a custom credit scoring algorithm.',
      limitations: 'Regulatory compliance challenges vary by jurisdiction.',
      dept: 'Business', set: '2021/2022', authors: [biz._id], supervisor: sup._id, status: 'pending',
      likes: [cs._id, eng._id], bookmarks: [cs._id], ratings: [{ user: cs._id, value: 4, weight: 1 }],
    },
    {
      title: 'Blockchain Certificate Verification System',
      summary: 'Decentralised ledger for issuing and verifying academic certificates, eliminating document forgery and streamlining employer background checks.',
      problem: 'Rampant certificate forgery in employment and postgraduate applications.',
      methodology: 'Ethereum smart contracts + IPFS storage + React.js employer-facing portal.',
      limitations: 'Gas fees and blockchain finality times may slow real-time verification.',
      dept: 'Computer Science', set: '2023/2024', authors: [cs._id, eng._id], supervisor: sup._id, status: 'approved',
      docName: 'blockchain_whitepaper.pdf',
      likes: [sup._id, biz._id], bookmarks: [sup._id],
      ratings: [{ user: sup._id, value: 5, weight: 1.5 }, { user: biz._id, value: 4, weight: 1 }],
      comments: [{ user: sup._id, text: 'This is exactly the kind of cross-departmental project institutions should fund.' }],
    },
  ];
  for (const p of projectsData) await Project.create(p);

  console.log('Creating notifications...');
  await Notification.create([
    { user: cs._id, text: 'Dr. Sarah Okonkwo approved your project "AI-Powered Student Performance Predictor" ✓', type: 'approval' },
    { user: eng._id, text: 'Chukwuemeka Adeyemi liked your project "Smart Waste Management via IoT Sensors"', type: 'like' },
    { user: sup._id, text: 'New project submitted for review: "Fintech Microfinance App" by Kwame Boateng', type: 'submission' },
  ]);

  console.log('\n✓ Seed complete!');
  console.log('  Demo login password for all accounts: demo123');
  console.log('  Admin:      admin@prostech.edu');
  console.log('  Supervisor: s.okonkwo@uni.edu');
  console.log('  Student:    c.adeyemi@stu.edu');
  console.log('  Guest:      guest@view.edu');

  // Force a checkpoint to disk before shutting down (important for embedded DB).
  try {
    await mongoose.connection.db.admin().command({ fsync: 1 });
  } catch {
    /* fsync may be unavailable on some hosts; safe to ignore */
  }
  await mongoose.connection.close();
  if (process.env.USE_EMBEDDED_DB === 'true') await stopEmbeddedMongo();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
