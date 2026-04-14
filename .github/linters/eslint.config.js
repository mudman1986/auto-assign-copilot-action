const commonGlobals = {
  afterAll: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  Buffer: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  jest: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  test: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly'
}

module.exports = [
  {
    ignores: [
      'dist/**',
      'vendor/**'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: commonGlobals
    },
    rules: {}
  }
]
