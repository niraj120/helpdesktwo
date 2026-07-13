import { Request, Response, NextFunction } from 'express';

interface ErrorWithStatus extends Error {
  statusCode?: number;
}

export const errorHandler = (
  err: ErrorWithStatus,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Always log the full detail server-side for diagnosis.
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    statusCode,
    path: req.path,
    method: req.method,
  });

  // GIGW/security: never leak internal error detail on 5xx in production.
  // 4xx messages are client-facing (validation/auth) and safe to return.
  const message =
    isProduction && statusCode >= 500
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: message,
    // Stack traces are exposed only outside production.
    ...(!isProduction && { stack: err.stack }),
  });
};
