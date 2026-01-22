#!/usr/bin/env node

/**
 * Structured logging utility using Pino
 * Provides log levels and automatic redaction of sensitive information
 */

const pino = require('pino')

// Create logger instance with redaction for sensitive fields
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'token',
      'password',
      'secret',
      'apiKey',
      'api_key',
      'authorization',
      'auth',
      '*.token',
      '*.password',
      '*.secret'
    ],
    censor: '[REDACTED]'
  },
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() }
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime
})

// Export logger methods for backward compatibility with console.log style
module.exports = {
  debug: (msg, ...args) => logger.debug(msg, ...args),
  info: (msg, ...args) => logger.info(msg, ...args),
  warn: (msg, ...args) => logger.warn(msg, ...args),
  error: (msg, ...args) => logger.error(msg, ...args),
  log: (msg, ...args) => logger.info(msg, ...args),
  // For testing
  logger
}
