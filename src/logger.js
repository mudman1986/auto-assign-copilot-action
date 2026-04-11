function info (message) {
  console.log(message)
}

function warning (message) {
  console.warn(`::warning::${message}`)
}

function error (message) {
  console.error(message)
}

module.exports = {
  info,
  warning,
  error
}
