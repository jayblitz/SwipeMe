import winston from "winston";

const { combine, timestamp, printf, colorize } = winston.format;

const securityFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    securityFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        securityFormat
      ),
    }),
  ],
});

export function logSecurityEvent(
  event: string,
  details: {
    email?: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
    success: boolean;
    reason?: string;
  }
) {
  const level = details.success ? "info" : "warn";
  logger.log(level, `SECURITY: ${event}`, {
    ...details,
    timestamp: new Date().toISOString(),
  });
}

export function logFailedLogin(email: string, ip: string, reason: string) {
  logSecurityEvent("LOGIN_FAILED", { email, ip, success: false, reason });
}

export function logSuccessfulLogin(email: string, userId: string, ip: string) {
  logSecurityEvent("LOGIN_SUCCESS", { email, userId, ip, success: true });
}

export function logRateLimitHit(route: string, ip: string, email?: string) {
  logSecurityEvent("RATE_LIMIT_HIT", { email, ip, success: false, reason: `Rate limit exceeded on ${route}` });
}

export function log2FAAttempt(userId: string, ip: string, success: boolean) {
  logSecurityEvent("2FA_ATTEMPT", { userId, ip, success, reason: success ? undefined : "Invalid 2FA code" });
}

export function logWalletAction(action: string, userId: string, success: boolean, details?: string) {
  logSecurityEvent(`WALLET_${action.toUpperCase()}`, { userId, success, reason: details });
}
