import { z } from 'zod';

// Mock the logging module
jest.mock('./logging', () => ({ 
  logger: { 
    info: jest.fn(), 
    error: jest.fn() 
  } 
}));

// Mock process.exit
const mockExit = jest.fn();
// @ts-ignore
process.exit = mockExit;

// Setup mock for Zod to return or throw as needed
const mockZodParse = jest.fn();
jest.mock('zod', () => {
  const originalModule = jest.requireActual('zod');
  return {
    ...originalModule,
    z: {
      ...originalModule.z,
      object: () => ({
        parse: mockZodParse
      })
    }
  };
});

// Store original environment
const OLD_ENV = process.env;

describe('validateEnv', () => {
  beforeEach(() => {
    // Reset modules before each test
    jest.resetModules();
    mockExit.mockClear();
    mockZodParse.mockClear();
    
    // Set up a new process.env
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    // Restore original process.env
    process.env = OLD_ENV;
  });

  test('should exit when required variables are missing', () => {
    // Configure Zod mock to throw error
    mockZodParse.mockImplementation(() => {
      // @ts-ignore - Creating a mock Zod error for testing
      throw new z.ZodError([
        {
          code: 'invalid_type',
          path: ['BINANCE_KEY'],
          message: 'BINANCE_KEY es requerida',
          expected: 'string',
          received: 'undefined'
        }
      ]);
    });

    // Set only some required variables, missing BINANCE_KEY
    process.env.BINANCE_SECRET = 'sec';
    process.env.LUNAR_KEY = 'lun';
    process.env.DEEPSEEK_API_KEY = 'deep';
    
    // Import and execute validateEnv
    const { validateEnv } = require('./env');
    validateEnv();
    
    // Verify process.exit was called with code 1
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('should validate with minimum required variables', () => {
    // Mock Zod to return a valid environment object
    const validEnv = {
      BINANCE_KEY: 'key',
      BINANCE_SECRET: 'sec',
      LUNAR_KEY: 'lun',
      DEEPSEEK_API_KEY: 'deep',
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      DRY_RUN: true
    };
    mockZodParse.mockReturnValue(validEnv);

    // Set all required variables
    process.env.BINANCE_KEY = 'key';
    process.env.BINANCE_SECRET = 'sec';
    process.env.LUNAR_KEY = 'lun';
    process.env.DEEPSEEK_API_KEY = 'deep';
    process.env.NODE_ENV = 'development';
    process.env.DRY_RUN = 'true';

    // Import and execute validateEnv
    const { validateEnv } = require('./env');
    const env = validateEnv();

    // Verify return value
    expect(env).toEqual(expect.objectContaining({
      BINANCE_KEY: 'key',
      BINANCE_SECRET: 'sec',
      LUNAR_KEY: 'lun',
      DEEPSEEK_API_KEY: 'deep',
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      DRY_RUN: true
    }));
    
    // Verify process.exit was NOT called
    expect(mockExit).not.toHaveBeenCalled();
  });

  test('should use custom values for optional variables', () => {
    // Mock Zod to return a valid environment object with custom values
    const customEnv = {
      BINANCE_KEY: 'key',
      BINANCE_SECRET: 'sec',
      LUNAR_KEY: 'lun',
      DEEPSEEK_API_KEY: 'deep',
      NODE_ENV: 'production',
      LOG_LEVEL: 'error',
      DRY_RUN: false
    };
    mockZodParse.mockReturnValue(customEnv);

    // Set required variables with custom optional values
    process.env.BINANCE_KEY = 'key';
    process.env.BINANCE_SECRET = 'sec';
    process.env.LUNAR_KEY = 'lun';
    process.env.DEEPSEEK_API_KEY = 'deep';
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'error';
    process.env.DRY_RUN = 'false';

    // Import and execute validateEnv
    const { validateEnv } = require('./env');
    const env = validateEnv();

    // Verify return value
    expect(env.NODE_ENV).toBe('production');
    expect(env.LOG_LEVEL).toBe('error');
    expect(env.DRY_RUN).toBe(false);
    
    // Verify process.exit was NOT called
    expect(mockExit).not.toHaveBeenCalled();
  });

  test('should exit when optional variable has invalid value', () => {
    // Configure Zod mock to throw error for invalid optional variable
    mockZodParse.mockImplementation(() => {
      // @ts-ignore - Creating a mock Zod error for testing
      throw new z.ZodError([
        {
          code: 'invalid_enum_value',
          path: ['LOG_LEVEL'],
          message: "Invalid enum value. Expected 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal', received 'verbose'",
          options: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
          received: 'verbose'
        }
      ]);
    });

    // Set all required variables with invalid LOG_LEVEL
    process.env.BINANCE_KEY = 'key';
    process.env.BINANCE_SECRET = 'sec';
    process.env.LUNAR_KEY = 'lun';
    process.env.DEEPSEEK_API_KEY = 'deep';
    process.env.LOG_LEVEL = 'verbose';

    // Import and execute validateEnv
    const { validateEnv } = require('./env');
    validateEnv();
    
    // Verify process.exit was called with code 1
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
