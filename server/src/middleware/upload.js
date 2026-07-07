import multer from 'multer';

// Keep the file in memory; the controller streams it to Cloudinary when configured.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});
