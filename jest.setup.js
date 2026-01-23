/**
 * Jest setup file to reduce verbose test output
 * Mocks @actions/core logging functions during tests
 * to suppress info/debug messages while preserving warnings and errors
 */

// Mock @actions/core to suppress verbose logging during tests
jest.mock('@actions/core', () => {
  const actual = jest.requireActual('@actions/core')
  return {
    ...actual,
    // Suppress info and debug messages
    info: jest.fn(),
    debug: jest.fn(),
    // Keep warnings and errors visible
    warning: actual.warning,
    error: actual.error,
    setFailed: actual.setFailed
  }
})
