import { Response } from 'express';

/**
 * Send a standardized success response
 */
export const sendSuccessResponse = (
  res: Response,
  data: any,
  message: string = 'Success',
  statusCode: number = 200
): void => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Send a standardized error response
 */
export const sendErrorResponse = (
  res: Response,
  message: string = 'An error occurred',
  statusCode: number = 500,
  errors?: any
): void => {
  res.status(statusCode).json({
    success: false,
    message,
    ...(errors && { errors }),
  });
};
