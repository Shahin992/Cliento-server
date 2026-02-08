import { Response } from 'express';

export type ApiResponse<T> = {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  token?: string;
  details?: string;
};

export const sendResponse = <T>(res: Response, payload: ApiResponse<T>) => {
  return res.status(payload.statusCode).json(payload);
};

export const sendError = (res: Response, payload: ApiResponse<null>) => {
  return res.status(payload.statusCode).json(payload);
};
