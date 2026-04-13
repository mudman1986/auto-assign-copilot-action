jest.unmock('./logger.js')

const logger = require('./logger.js')

function flushPromises () {
  return new Promise(resolve => setImmediate(resolve))
}

describe('logger', () => {
  afterEach(() => {
    logger.__resetCoreLoaderForTests()
    jest.restoreAllMocks()
  })

  test('falls back to console when core loading fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    logger.__setCoreLoaderForTests(async () => {
      throw new Error('load failed')
    })

    logger.warning('warning message')
    await flushPromises()

    expect(warnSpy).toHaveBeenCalledWith('warning message')
  })

  test('falls back to console when requested method is unavailable', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    logger.__setCoreLoaderForTests(async () => ({}))

    logger.error('error message')
    await flushPromises()

    expect(errorSpy).toHaveBeenCalledWith('error message')
  })

  test('caches the loaded core module', async () => {
    const core = { info: jest.fn() }
    const loader = jest.fn().mockResolvedValue(core)

    logger.__setCoreLoaderForTests(loader)

    logger.info('first message')
    await flushPromises()
    logger.info('second message')
    await flushPromises()

    expect(loader).toHaveBeenCalledTimes(1)
    expect(core.info).toHaveBeenCalledTimes(2)
    expect(core.info).toHaveBeenNthCalledWith(1, 'first message')
    expect(core.info).toHaveBeenNthCalledWith(2, 'second message')
  })
})
