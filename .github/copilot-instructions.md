# Copilot Instructions

## Development Workflow

### Linter Configuration

This project uses the following linter configurations:

- **`.github/linters/.super-linter.yml`**: Configuration for Super-Linter CI (excludes `dist/` directory)
- **`package.json`** (`standard` section): Configuration for JavaScript Standard Style with Jest globals

The `dist/` directory is excluded from linting as it contains compiled code.

### Running Super-Linter Locally

Before pushing changes, run super-linter locally to catch linting issues:

```bash
# Pull the latest super-linter image
docker pull github/super-linter:latest

# Run super-linter on the entire codebase
docker run --rm \
  -e RUN_LOCAL=true \
  -e USE_FIND_ALGORITHM=true \
  -v $(pwd):/tmp/lint \
  github/super-linter:latest

# Or run super-linter on specific files (e.g., JavaScript files only)
docker run --rm \
  -e RUN_LOCAL=true \
  -e USE_FIND_ALGORITHM=true \
  -e VALIDATE_JAVASCRIPT_STANDARD=true \
  -v $(pwd):/tmp/lint \
  github/super-linter:latest
```

### JavaScript Standard Style

This project uses [JavaScript Standard Style](https://standardjs.com/) for linting.

Configuration is in the `standard` section of `package.json`.

Auto-fix linting issues:
```bash
npx standard --fix src/*.js
npx standard --fix src/*.test.js
```

Check linting without fixing:
```bash
npx standard
```

### Testing

Run all tests:
```bash
npm test
```

Run specific test file:
```bash
npm test -- src/release.test.js
```

### Building

Build the action:
```bash
npm run build
```