export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, 'DATABASE_ERROR', 500);
    this.name = 'DatabaseError';
    if (originalError) {
      this.cause = originalError;
    }
  }
}

export class NetworkError extends AppError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR', 503);
    this.name = 'NetworkError';
  }
}

export class PermissionError extends AppError {
  constructor(message: string) {
    super(message, 'PERMISSION_DENIED', 403);
    this.name = 'PermissionError';
  }
}

export const handleError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    // Handle specific WatermelonDB errors
    if (error.message.includes('database') || error.message.includes('transaction')) {
      return new DatabaseError(error.message, error);
    }

    // Handle network errors
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return new NetworkError('Network connection failed');
    }

    // Generic error
    return new AppError(error.message, 'UNKNOWN_ERROR');
  }

  // Handle string errors
  if (typeof error === 'string') {
    return new AppError(error, 'UNKNOWN_ERROR');
  }

  // Handle unknown errors
  return new AppError('An unexpected error occurred', 'UNKNOWN_ERROR');
};
