import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

/**
 * Middleware factory to validate MongoDB ObjectId parameters
 * Prevents NoSQL injection attacks by ensuring IDs are valid ObjectIds
 * 
 * @param paramNames - Array of parameter names to validate (defaults to ['id'])
 * @returns Express middleware function
 * 
 * @example
 * // Validate single 'id' param
 * router.get('/:id', validateObjectId(), getItem);
 * 
 * // Validate specific params
 * router.get('/:projectId/tickets/:ticketId', validateObjectId(['projectId', 'ticketId']), getTicket);
 */
export const validateObjectId = (paramNames: string[] = ['id']) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const invalidParams: string[] = [];

    for (const paramName of paramNames) {
      const paramValue = req.params[paramName];
      
      // Skip if parameter doesn't exist (optional params)
      if (paramValue === undefined) {
        continue;
      }

      // Check if the value is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(paramValue)) {
        invalidParams.push(paramName);
      }
    }

    if (invalidParams.length > 0) {
      res.status(400).json({
        success: false,
        message: `Invalid ID format for parameter(s): ${invalidParams.join(', ')}`,
        error: 'INVALID_OBJECT_ID'
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to validate ObjectId in request body
 * 
 * @param fieldNames - Array of field names in body to validate
 * @returns Express middleware function
 * 
 * @example
 * router.post('/assign', validateBodyObjectId(['userId', 'ticketId']), assignTicket);
 */
export const validateBodyObjectId = (fieldNames: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const invalidFields: string[] = [];

    for (const fieldName of fieldNames) {
      const fieldValue = req.body[fieldName];
      
      // Skip if field doesn't exist or is null/undefined
      if (fieldValue === undefined || fieldValue === null) {
        continue;
      }

      // Handle arrays of ObjectIds
      if (Array.isArray(fieldValue)) {
        const hasInvalidId = fieldValue.some(
          (id) => typeof id === 'string' && !mongoose.Types.ObjectId.isValid(id)
        );
        if (hasInvalidId) {
          invalidFields.push(`${fieldName}[]`);
        }
      } else if (typeof fieldValue === 'string' && !mongoose.Types.ObjectId.isValid(fieldValue)) {
        invalidFields.push(fieldName);
      }
    }

    if (invalidFields.length > 0) {
      res.status(400).json({
        success: false,
        message: `Invalid ID format for field(s): ${invalidFields.join(', ')}`,
        error: 'INVALID_OBJECT_ID'
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to validate ObjectId in query parameters
 * 
 * @param queryNames - Array of query parameter names to validate
 * @returns Express middleware function
 * 
 * @example
 * router.get('/tickets', validateQueryObjectId(['projectId', 'assignedTo']), getTickets);
 */
export const validateQueryObjectId = (queryNames: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const invalidQueries: string[] = [];

    for (const queryName of queryNames) {
      const queryValue = req.query[queryName];
      
      // Skip if query doesn't exist
      if (queryValue === undefined || queryValue === '') {
        continue;
      }

      // Handle string query values
      if (typeof queryValue === 'string' && !mongoose.Types.ObjectId.isValid(queryValue)) {
        invalidQueries.push(queryName);
      }
    }

    if (invalidQueries.length > 0) {
      res.status(400).json({
        success: false,
        message: `Invalid ID format for query parameter(s): ${invalidQueries.join(', ')}`,
        error: 'INVALID_OBJECT_ID'
      });
      return;
    }

    next();
  };
};

export default validateObjectId;
