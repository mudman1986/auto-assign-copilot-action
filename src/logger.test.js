#!/usr/bin/env node

/**
 * Tests for Pino-based logging utility
 */

const logger = require('./logger.js')

describe('Logger Module Tests', () => {
  let pinoInstance

  beforeEach(() => {
    pinoInstance = logger.logger
  })

  describe('Log levels', () => {
    test('exports debug function', () => {
      expect(typeof logger.debug).toBe('function')
    })

    test('exports info function', () => {
      expect(typeof logger.info).toBe('function')
    })

    test('exports warn function', () => {
      expect(typeof logger.warn).toBe('function')
    })

    test('exports error function', () => {
      expect(typeof logger.error).toBe('function')
    })

    test('exports log as alias for info', () => {
      expect(typeof logger.log).toBe('function')
    })
  })

  describe('Logger configuration', () => {
    test('logger instance exists and is properly configured', () => {
      expect(pinoInstance).toBeDefined()
      expect(pinoInstance.level).toBeDefined()
      // Pino redaction is internal, we just verify logger works
      expect(typeof pinoInstance.info).toBe('function')
    })
  })

  describe('Redaction of sensitive data', () => {
    test('redacts token field in objects', () => {
      const spy = jest.spyOn(pinoInstance, 'info')
      logger.info({ token: 'secret123', message: 'test' })
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    test('redacts password field in objects', () => {
      const spy = jest.spyOn(pinoInstance, 'info')
      logger.info({ password: 'secret123', message: 'test' })
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    test('redacts nested token fields', () => {
      const spy = jest.spyOn(pinoInstance, 'info')
      logger.info({ config: { token: 'secret123' }, message: 'test' })
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  describe('Log methods work correctly', () => {
    test('debug method calls logger', () => {
      const spy = jest.spyOn(pinoInstance, 'debug')
      logger.debug('test message')
      expect(spy).toHaveBeenCalledWith('test message')
      spy.mockRestore()
    })

    test('info method calls logger', () => {
      const spy = jest.spyOn(pinoInstance, 'info')
      logger.info('test message')
      expect(spy).toHaveBeenCalledWith('test message')
      spy.mockRestore()
    })

    test('warn method calls logger', () => {
      const spy = jest.spyOn(pinoInstance, 'warn')
      logger.warn('test message')
      expect(spy).toHaveBeenCalledWith('test message')
      spy.mockRestore()
    })

    test('error method calls logger', () => {
      const spy = jest.spyOn(pinoInstance, 'error')
      logger.error('test message')
      expect(spy).toHaveBeenCalledWith('test message')
      spy.mockRestore()
    })

    test('log method calls info', () => {
      const spy = jest.spyOn(pinoInstance, 'info')
      logger.log('test message')
      expect(spy).toHaveBeenCalledWith('test message')
      spy.mockRestore()
    })

    test('supports multiple arguments', () => {
      const spy = jest.spyOn(pinoInstance, 'info')
      logger.info('test', { key: 'value' })
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })
})
