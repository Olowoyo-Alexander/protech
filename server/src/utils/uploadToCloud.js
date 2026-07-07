import cloudinary, { cloudinaryReady } from '../config/cloudinary.js';

/**
 * Upload a Multer in-memory file buffer to Cloudinary.
 * Returns { url, name } or null if Cloudinary isn't configured.
 */
export function uploadToCloud(file) {
  if (!file || !cloudinaryReady()) return Promise.resolve(null);

  const publicId = `${Date.now()}-${file.originalname
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9]/gi, '_')}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'prostech/documents', resource_type: 'auto', public_id: publicId },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, name: file.originalname });
      }
    );
    stream.end(file.buffer);
  });
}
