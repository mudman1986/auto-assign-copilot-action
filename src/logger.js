let corePromise

function loadCore () {
  return import('@actions/core')
    .then(module => module.default || module)
    .catch(() => null)
}

let coreLoader = loadCore

async function getCore () {
  corePromise ??= coreLoader()

  return corePromise
}

function logWithCore (method, fallback, message) {
  const text = String(message)

  return getCore()
    .then((core) => {
      if (core?.[method]) {
        core[method](text)
        return
      }

      fallback(text)
    })
    .catch(() => {
      fallback(text)
    })
}

function info (message) {
  return logWithCore('info', console.log, message)
}

function warning (message) {
  return logWithCore('warning', console.warn, message)
}

function error (message) {
  return logWithCore('error', console.error, message)
}

module.exports = {
  info,
  warning,
  error,
  __getCoreForTests: getCore,
  __setCoreLoaderForTests (loader) {
    coreLoader = loader
    corePromise = undefined
  },
  __resetCoreLoaderForTests () {
    coreLoader = loadCore
    corePromise = undefined
  }
}
