export interface ErrorDetail {
  path?: string;
  message: string;
}

export interface CustomError extends Error {
  statusCode: number;
  errors?: ErrorDetail[];
}

export const createError = (statusCode: number, message: string, errors?: ErrorDetail[]): CustomError => {
  const error = new Error(message) as CustomError;
  error.statusCode = statusCode;
  error.errors = errors;
  return error;
};
