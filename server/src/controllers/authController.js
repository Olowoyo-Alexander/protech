import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import dns from 'dns';
import User from '../models/User.js';
import { sendVerificationEmail, sendWelcomeEmail } from '../utils/email.js';

const AV_COLORS = ['av-amber', 'av-blue', 'av-green', 'av-red', 'av-purple'];
const pickColor = (name) =>
  AV_COLORS[Math.abs([...name].reduce((a, c) => a + c.charCodeAt(0), 0)) % AV_COLORS.length];

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const publicUser = (u) => ({
  _id: u._id,
  title: u.title,
  name: u.name,
  email: u.email,
  role: u.role,
  dept: u.dept,
  set: u.set,
  level: u.level,
  matric: u.matric,
  supervisorTag: u.supervisorTag,
  bio: u.bio,
  verified: u.verified,
  active: u.active,
  avatarColor: u.avatarColor,
});

const genCode = () => String(Math.floor(100000 + Math.random() * 900000));

// Hard ceiling on admin accounts — a platform this size never needs more,
// and it limits the blast radius if the setup key ever leaks.
const MAX_ADMIN_ACCOUNTS = 3;

// Standard email format check (mirrors the client-side validator). The domain
// must include at least one dot, so "foo@bar" is rejected.
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const isValidEmail = (email = '') => EMAIL_RE.test(String(email).trim());

// Matric number format, e.g. "ETC/22/001" (students only).
const MATRIC_RE = /^[A-Z]{2,4}\/\d{2}\/\d{3}$/;

// Allowed supervisor titles.
const TITLES = ['Dr.', 'Mr.', 'Ms.', 'Professor'];

// Confirm the email's domain actually exists and can receive mail. We check for
// MX records first, then fall back to an A/AAAA lookup (some valid domains
// accept mail without an explicit MX). Returns false ONLY when the resolver
// positively reports the domain doesn't exist (NXDOMAIN/ENODATA) — any other
// error (offline, timeout, server failure) fails open so we never block a
// legitimate signup because of a transient network issue.
async function emailDomainExists(domain) {
  if (!domain) return false;
  try {
    const mx = await dns.promises.resolveMx(domain);
    if (mx && mx.length) return true;
  } catch (e) {
    if (e.code !== 'ENOTFOUND' && e.code !== 'ENODATA') return true; // fail open
  }
  try {
    await dns.promises.lookup(domain);
    return true;
  } catch (e) {
    if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') return false;
    return true; // fail open on transient errors
  }
}

// Guard the DNS check with a timeout so a slow resolver can't hang signup.
const withTimeout = (promise, ms, fallback) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);

// POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'student', dept = '', set = '' } = req.body;
  const matric = String(req.body.matric || '').trim().toUpperCase();
  const title = String(req.body.title || '').trim();
  const adminSetupKey = String(req.body.adminSetupKey || '');

  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    res.status(400);
    throw new Error('Please fill in all required fields');
  }
  // Admin is never publicly self-serve. Registration only succeeds with the
  // exact ADMIN_SETUP_KEY configured server-side (Render dashboard) — if it
  // isn't set at all, admin registration is closed entirely, even with a key.
  if (role === 'admin') {
    if (!process.env.ADMIN_SETUP_KEY || adminSetupKey !== process.env.ADMIN_SETUP_KEY) {
      res.status(403);
      throw new Error('Invalid or missing admin setup key');
    }
    // Soft-deleted admins don't count — they no longer function as admins.
    const adminCount = await User.countDocuments({ role: 'admin', deleted: { $ne: true } });
    if (adminCount >= MAX_ADMIN_ACCOUNTS) {
      res.status(403);
      throw new Error(`Admin account limit reached (max ${MAX_ADMIN_ACCOUNTS})`);
    }
  }
  if (!isValidEmail(email)) {
    res.status(400);
    throw new Error('Please enter a valid email address');
  }
  // Make sure the domain actually exists (catches typos like "gmail.cum").
  const domain = email.toLowerCase().trim().split('@')[1];
  if (!(await withTimeout(emailDomainExists(domain), 4000, true))) {
    res.status(400);
    throw new Error(`We couldn't find the email domain "${domain}". Please check for a typo.`);
  }
  if (password.length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }
  if (await User.findOne({ email: email.toLowerCase() })) {
    res.status(400);
    throw new Error('This email is already registered');
  }
  // Title is optional at registration — supervisors can set it later on their
  // profile. If one is supplied it must be a recognised honorific.
  if (role === 'student' && !MATRIC_RE.test(matric)) {
    res.status(400);
    throw new Error('Please enter a valid matric number (e.g. ETC/22/001)');
  }
  // No two students may share a matric number (students can also sign in with
  // it, so it must uniquely identify one account).
  if (role === 'student' && (await User.findOne({ matric }))) {
    res.status(400);
    throw new Error('This matric number is already registered');
  }

  const user = await User.create({
    title: role === 'supervisor' && TITLES.includes(title) ? title : '',
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    role,
    dept,
    set: role === 'student' ? set : '',
    matric: role === 'student' ? matric : '',
    verified: false, // every new account confirms its email before signing in
    avatarColor: pickColor(name),
  });

  // Every new user must confirm their email with a code before they can sign in.
  // Do not log them in yet — the welcome email follows once they verify.
  const code = genCode();
  user.verifyCode = code;
  user.verifyExpires = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();
  const result = await sendVerificationEmail(user.email, user.name, code);
  res.status(201).json({
    needsVerification: true,
    email: user.email,
    devCode: result.delivered ? undefined : code, // surfaced in dev only
    message: result.delivered
      ? 'Verification code sent to your email.'
      : 'Email not configured — code returned for dev testing.',
  });
});

// POST /api/auth/verify  { email, code }
export const verifySupervisor = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase() }).select(
    '+verifyCode +verifyExpires'
  );
  if (!user) {
    res.status(404);
    throw new Error('Account not found');
  }
  if (user.verified) {
    return res.json({ token: signToken(user._id), user: publicUser(user) });
  }
  if (!user.verifyCode || user.verifyExpires < new Date()) {
    res.status(400);
    throw new Error('Verification code expired. Please request a new one.');
  }
  if (user.verifyCode !== String(code).trim()) {
    res.status(400);
    throw new Error('Incorrect verification code');
  }

  user.verified = true;
  user.verifyCode = undefined;
  user.verifyExpires = undefined;
  await user.save();

  // Supervisor is now active — send the welcome email (fire-and-forget).
  sendWelcomeEmail(user.email, user.name, user.role);

  res.json({ token: signToken(user._id), user: publicUser(user) });
});

// POST /api/auth/resend  { email }
export const resendCode = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase() }).select('+verifyCode');
  if (!user || user.verified) {
    res.status(400);
    throw new Error('No pending verification for this account');
  }
  const code = genCode();
  user.verifyCode = code;
  user.verifyExpires = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();
  const result = await sendVerificationEmail(user.email, user.name, code);
  res.json({
    message: result.delivered ? 'A new code has been sent.' : 'SMTP not configured — code returned for dev.',
    devCode: result.delivered ? undefined : code,
  });
});

// Friendly labels for role-gateway error messages.
const ROLE_LABELS = { observer: 'Guest', student: 'Student', supervisor: 'Supervisor', admin: 'Admin' };

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password, expectedRole } = req.body;
  // Students may sign in with their email OR their matric number, so match
  // the identifier against either field.
  const id = String(email || '').trim();
  const query = MATRIC_RE.test(id.toUpperCase())
    ? { matric: id.toUpperCase() }
    : { email: id.toLowerCase() };
  const user = await User.findOne(query).select('+password');
  if (!user || user.deleted || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error('Invalid email or password');
  }
  if (!user.verified) {
    res.status(403);
    throw new Error('Please verify your email before signing in');
  }
  if (!user.active) {
    res.status(403);
    throw new Error('This account has been deactivated. Contact an administrator.');
  }
  // Each role has its own dedicated sign-in page. Reject accounts that don't
  // match the gateway they came from so nobody can sign in via the wrong URL.
  if (expectedRole && user.role !== expectedRole) {
    res.status(403);
    throw new Error(
      `This is a ${ROLE_LABELS[user.role] || user.role} account. Please sign in from the ${ROLE_LABELS[user.role] || user.role} page.`
    );
  }
  res.json({ token: signToken(user._id), user: publicUser(user) });
});

// GET /api/auth/me
export const me = asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user) });
});
