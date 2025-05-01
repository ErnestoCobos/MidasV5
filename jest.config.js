/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Add tests directory as a root
  roots: ['<rootDir>/src/', '<rootDir>/tests/'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    '^tests/(.*)$': '<rootDir>/tests/$1'
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover', 'html', 'json-summary'],
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/utils/worker-runner.js',
    '!src/demo-kelly.js',
    '!src/run-*.{ts,js}'
  ],
  // Coverage thresholds as per rule 40-tests.md
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80
    },
    'src/core/**/*.ts': {
      lines: 90,
      branches: 80
    },
    'src/services/**/*.ts': {
      lines: 85,
      branches: 70
    },
    'src/adapters/**/*.ts': {
      lines: 80
    },
    'src/utils/**/*.ts': {
      lines: 75
    },
    'src/strategies/**/*.ts': {
      lines: 85
    }
  }
};
