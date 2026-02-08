import { Request, Response, NextFunction } from 'express';
import { CustomError, createError } from './error';


export const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => {
  let customError: CustomError;

  if (err instanceof Error) {
    customError = err as CustomError;
    customError.statusCode = customError.statusCode || 500;
    customError.message = customError.message || 'Internal Server Error';
  } else {
    customError = createError(500, 'Internal Server Error');
  }

  res.status(customError.statusCode).send({
    success: false,
    statusCode: customError.statusCode,
    message: customError.message,
  });
};
