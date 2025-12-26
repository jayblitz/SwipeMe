export class AppError extends Error {
  code: string;
  statusCode?: number;
  isRetryable: boolean;

  constructor(message: string, code: string, options?: { statusCode?: number; isRetryable?: boolean }) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = options?.statusCode;
    this.isRetryable = options?.isRetryable ?? false;
  }
}

export const ErrorCodes = {
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  TRANSACTION_FAILED: "TRANSACTION_FAILED",
  WALLET_NOT_FOUND: "WALLET_NOT_FOUND",
  INVALID_ADDRESS: "INVALID_ADDRESS",
  SERVER_ERROR: "SERVER_ERROR",
  UNKNOWN: "UNKNOWN",
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCodes.NETWORK_ERROR]: "Unable to connect. Please check your internet connection.",
  [ErrorCodes.TIMEOUT]: "Request timed out. Please try again.",
  [ErrorCodes.UNAUTHORIZED]: "Your session has expired. Please sign in again.",
  [ErrorCodes.FORBIDDEN]: "You don't have permission to perform this action.",
  [ErrorCodes.NOT_FOUND]: "The requested resource was not found.",
  [ErrorCodes.VALIDATION_ERROR]: "Please check your input and try again.",
  [ErrorCodes.INSUFFICIENT_BALANCE]: "Insufficient balance for this transaction.",
  [ErrorCodes.TRANSACTION_FAILED]: "Transaction failed. Please try again.",
  [ErrorCodes.WALLET_NOT_FOUND]: "Wallet not found. Please set up your wallet first.",
  [ErrorCodes.INVALID_ADDRESS]: "Invalid wallet address format.",
  [ErrorCodes.SERVER_ERROR]: "Something went wrong. Please try again later.",
  [ErrorCodes.UNKNOWN]: "An unexpected error occurred.",
};

export function getUserFriendlyMessage(code: ErrorCode): string {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrorCodes.UNKNOWN];
}

export function parseApiError(error: unknown, response?: Response): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof TypeError && error.message.includes("fetch")) {
    return new AppError(
      getUserFriendlyMessage(ErrorCodes.NETWORK_ERROR),
      ErrorCodes.NETWORK_ERROR,
      { isRetryable: true }
    );
  }

  if (response) {
    const statusCode = response.status;
    
    if (statusCode === 401) {
      return new AppError(
        getUserFriendlyMessage(ErrorCodes.UNAUTHORIZED),
        ErrorCodes.UNAUTHORIZED,
        { statusCode }
      );
    }
    
    if (statusCode === 403) {
      return new AppError(
        getUserFriendlyMessage(ErrorCodes.FORBIDDEN),
        ErrorCodes.FORBIDDEN,
        { statusCode }
      );
    }
    
    if (statusCode === 404) {
      return new AppError(
        getUserFriendlyMessage(ErrorCodes.NOT_FOUND),
        ErrorCodes.NOT_FOUND,
        { statusCode }
      );
    }
    
    if (statusCode === 400) {
      const message = error instanceof Error ? error.message : getUserFriendlyMessage(ErrorCodes.VALIDATION_ERROR);
      return new AppError(message, ErrorCodes.VALIDATION_ERROR, { statusCode });
    }
    
    if (statusCode >= 500) {
      return new AppError(
        getUserFriendlyMessage(ErrorCodes.SERVER_ERROR),
        ErrorCodes.SERVER_ERROR,
        { statusCode, isRetryable: true }
      );
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("insufficient") || message.includes("balance")) {
      return new AppError(
        error.message,
        ErrorCodes.INSUFFICIENT_BALANCE
      );
    }
    
    if (message.includes("transaction") || message.includes("transfer")) {
      return new AppError(
        error.message,
        ErrorCodes.TRANSACTION_FAILED,
        { isRetryable: true }
      );
    }
    
    if (message.includes("wallet") && message.includes("not found")) {
      return new AppError(
        getUserFriendlyMessage(ErrorCodes.WALLET_NOT_FOUND),
        ErrorCodes.WALLET_NOT_FOUND
      );
    }
    
    if (message.includes("address") && (message.includes("invalid") || message.includes("format"))) {
      return new AppError(
        getUserFriendlyMessage(ErrorCodes.INVALID_ADDRESS),
        ErrorCodes.INVALID_ADDRESS
      );
    }
    
    return new AppError(error.message, ErrorCodes.UNKNOWN);
  }

  return new AppError(
    getUserFriendlyMessage(ErrorCodes.UNKNOWN),
    ErrorCodes.UNKNOWN
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; delayMs?: number; onRetry?: (attempt: number, error: Error) => void }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const delayMs = options?.delayMs ?? 1000;
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const appError = parseApiError(error);
      
      if (!appError.isRetryable || attempt === maxRetries) {
        throw appError;
      }
      
      options?.onRetry?.(attempt, lastError);
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
  
  throw lastError || new Error("Retry failed");
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isRetryable;
  }
  
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }
  
  return false;
}
