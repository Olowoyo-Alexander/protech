import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Persist data on disk so it survives restarts.
const DB_PATH = path.resolve(__dirname, '../../.mongo-data');

let mongod = null;

/**
 * Starts an embedded MongoDB (real mongod binary, downloaded once) with
 * on-disk persistence. Used for zero-install local development.
 * Returns the connection URI.
 */
export async function startEmbeddedMongo() {
  const fs = await import('fs');
  if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const opts = {
    instance: {
      port: 27017,
      dbName: 'prostech',
      dbPath: DB_PATH,
      storageEngine: 'wiredTiger',
    },
  };

  // First launch can exceed the default timeout while antivirus scans the
  // freshly downloaded mongod binary — retry once before giving up.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      mongod = await MongoMemoryServer.create(opts);
      const uri = mongod.getUri('prostech');
      console.log('✓ Embedded MongoDB started (data persisted at .mongo-data)');
      return uri;
    } catch (err) {
      if (attempt === 2) throw err;
      console.log('  Embedded MongoDB slow to start (first run) — retrying...');
    }
  }
}

export async function stopEmbeddedMongo() {
  if (mongod) await mongod.stop({ doCleanup: false, force: false });
}
