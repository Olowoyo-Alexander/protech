import { v2 as cloudinary } from 'cloudinary';

// Configure lazily on first use — NOT at module load. This module is imported
// (via the controllers) before server.js runs dotenv.config(), so the
// CLOUDINARY_* env vars aren't populated yet at import time. Reading them on
// first use guarantees the env is ready. (Same gotcha as utils/email.js.)
let ready;
export function cloudinaryReady() {
  if (ready === undefined) {
    ready = Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
    if (ready) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    }
  }
  return ready;
}

export default cloudinary;
