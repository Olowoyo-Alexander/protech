import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import userRoutes from './routes/userRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import snippetRoutes from './routes/snippetRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import { notFound, errorHandler } from './middleware/error.js';
import { cloudinaryReady } from './config/cloudinary.js';

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);
// Raised limit accommodates snippet progress photos sent inline as data URLs
// (client resizes them first, so payloads stay modest).
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

app.get('/api/health', (req, res) =>
  res.json({
    status: 'ok',
    cloudinary: cloudinaryReady(),
    time: new Date().toISOString(),
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/snippets', snippetRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/supervisor', dashboardRoutes);

// Single-service deploy: the Express server also serves the built React app,
// so Render only needs to host one service (no separate Vercel/static host).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
