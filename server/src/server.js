import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app.js';
import { connectDB } from './config/db.js';
import { initSocket } from './socket/index.js';
import { cloudinaryReady } from './config/cloudinary.js';
import { startEmbeddedMongo } from './config/embeddedMongo.js';
import { refreshPlatformUsers } from './utils/platform.js';

const PORT = process.env.PORT || 5000;

async function start() {
  if (process.env.USE_EMBEDDED_DB === 'true') {
    process.env.MONGO_URI = await startEmbeddedMongo();
  }
  await connectDB();
  await refreshPlatformUsers().catch(() => {}); // warm the star-scaling population

  const server = http.createServer(app);
  initSocket(server);

  server.listen(PORT, () => {
    console.log(`✓ PROTECH API running on http://localhost:${PORT}`);
    console.log(`  Cloudinary: ${cloudinaryReady() ? 'enabled' : 'NOT configured (uploads disabled)'}`);
    console.log(`  Email (Brevo): ${process.env.BREVO_API_KEY ? 'enabled' : 'dev mode (codes logged to console)'}`);
  });
}

start();
