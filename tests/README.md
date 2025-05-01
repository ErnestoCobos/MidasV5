# MidasTS Test Suite

This directory contains all tests for the MidasTS project, organized following industry best practices and the project's own specifications.

## Test Structure

The tests are organized in three main categories:

### 1. Unit Tests (`unit/`)

Tests for individual functions, classes, and components in isolation. Mocks are used for external dependencies.

- `core/` - Tests for domain entities, value objects, and pure functions
- `services/` - Tests for service implementations
- `utils/` - Tests for utility functions

### 2. Integration Tests (`integration/`)

Tests that verify multiple components work together correctly.

- `adapters/` - Tests for external system adapters (Binance, LunarCrush, etc.)
- `repositories/` - Tests for data access components 
- `services/` - Tests for service interactions

### 3. End-to-End Tests (`e2e/`)

Tests that simulate real user workflows from start to finish.

- `portfolio/` - Full portfolio management workflows
- `scanner/` - Market scanning workflows
- `telegram/` - Telegram bot interaction workflows

## Coverage Requirements

Following rule 40-tests.md, the minimum coverage requirements are:

- Domain and Core: 90% lines, 80% branches
- Services: 85% lines, 70% branches
- Adapters: 80% lines
- Utilities: 75% lines
- Strategies: 85% lines

## Running Tests

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only E2E tests
npm run test:e2e

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Writing New Tests

When creating new tests, follow these naming conventions:
- Unit tests: `[component-name].test.ts`
- Integration tests: `[component-name].integration.test.ts`
- E2E tests: `[workflow-name].e2e.test.ts`

Tests should follow the Arrange-Act-Assert pattern and use descriptive test names.
