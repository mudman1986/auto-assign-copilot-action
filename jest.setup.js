/**
 * Jest setup file to reduce verbose test output
 * Mocks local logging functions during tests
 * to suppress info/debug messages while preserving warnings and errors
 */

// Mock local logger to suppress verbose logging during tests
jest.mock('./src/logger.js', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
}))
