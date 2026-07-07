export function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Not found: ${req.originalUrl}`));
}

export function errorHandler(err, req, res, next) {
  let status = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  let message = err.message;

  // Mongoose bad ObjectId
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    status = 404;
    message = 'Resource not found';
  }
  // Duplicate key
  if (err.code === 11000) {
    status = 400;
    message = `Duplicate value for ${Object.keys(err.keyValue).join(', ')}`;
  }

  res.status(status).json({
    message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
}
