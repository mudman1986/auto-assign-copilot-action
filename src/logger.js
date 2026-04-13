let corePromise

async function getCore () {
  corePromise ??= import('@actions/core')
    .then(module => module.default || module)
    .catch(() => null)

  return corePromise
}

function logWithCore (method, fallback, message) {
  const text = String(message)

  getCore()
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
  logWithCore('info', console.log, message)
}

function warning (message) {
  logWithCore('warning', console.warn, message)
}

function error (message) {
  logWithCore('error', console.error, message)
}

module.exports = {
  info,
  warning,
  error
}
