# Test Coverage

This project has been configured with Jest test coverage reporting. The coverage setup collects data on how much of the codebase is covered by tests.

## Current Coverage Status

As of now, the project has minimal test coverage (less than 1%). The first step to improving test quality is having visibility into what parts of the code are tested.

## Running Tests with Coverage

```bash
# Run tests with coverage
npm run test:coverage

# Open the HTML coverage report in your browser
npm run coverage:view

# Run tests in watch mode (useful during development)
npm run test:watch
```

## Coverage Configuration

The coverage configuration is in `jest.config.js` and includes the following:

- Coverage reports are generated in `./coverage/`
- Multiple report formats: text, HTML, lcov, and clover
- Coverage thresholds are temporarily disabled but can be enabled when more tests are added

## Excluded Files

The following files are excluded from coverage reports:
- Type definition files (*.d.ts)
- Test files (*.test.ts)
- Worker runner (worker-runner.js)
- Demo files (demo-kelly.js)
- Run-specific files (run-*.ts, run-*.js)

## Increasing Coverage

To increase test coverage:

1. Focus on writing tests for critical business logic first
2. Look at the coverage report to identify untested areas
3. Incrementally add tests for components and utilities
4. When sufficient tests are in place, enable coverage thresholds in jest.config.js

## Future Improvements

- Add coverage thresholds when coverage improves
- Integrate coverage reporting with CI/CD pipelines
- Add more comprehensive tests for core functionality
