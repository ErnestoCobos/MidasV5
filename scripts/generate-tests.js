/**
 * Test Generation Script
 * 
 * This script helps to generate test files for source files that don't have tests yet.
 * It follows rule 40-tests.md to create appropriate test templates based on component type.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Directory mappings for tests
const SOURCE_TO_TEST_MAPPING = {
  'src/core/domain/': 'tests/unit/core/',
  'src/core/application/': 'tests/unit/core/',
  'src/core/analysis/': 'tests/unit/core/',
  'src/core/math/': 'tests/unit/core/',
  'src/services/': 'tests/unit/services/',
  'src/utils/': 'tests/unit/utils/',
  'src/adapters/': 'tests/integration/adapters/',
  'src/repositories/': 'tests/integration/repositories/',
  'src/strategies/': 'tests/unit/strategies/'
};

// Coverage thresholds by component type (from rule 40-tests.md)
const COVERAGE_THRESHOLDS = {
  'domain': 90,
  'core': 90,
  'services': 85,
  'adapters': 80,
  'utils': 75,
  'strategies': 85
};

/**
 * Find source files that don't have corresponding test files
 * @returns {Object} Object with file paths grouped by component type
 */
function findSourceFilesWithoutTests() {
  const result = {
    'core': [],
    'services': [],
    'adapters': [],
    'utils': [],
    'strategies': [],
    'repositories': []
  };
  
  for (const [srcDir, testDir] of Object.entries(SOURCE_TO_TEST_MAPPING)) {
    if (!fs.existsSync(srcDir)) {
      console.log(`⚠️ Source directory ${srcDir} doesn't exist, skipping`);
      continue;
    }
    
    const files = getSourceFiles(srcDir);
    
    for (const file of files) {
      const relativePath = path.relative(srcDir, file);
      const testFile = path.join(testDir, relativePath.replace(/\.ts$/, '.test.ts'));
      
      if (!fs.existsSync(testFile)) {
        // Determine component type
        let componentType = 'utils'; // Default
        if (file.includes('/core/domain/')) componentType = 'domain';
        else if (file.includes('/core/')) componentType = 'core';
        else if (file.includes('/services/')) componentType = 'services';
        else if (file.includes('/adapters/')) componentType = 'adapters';
        else if (file.includes('/strategies/')) componentType = 'strategies';
        else if (file.includes('/repositories/')) componentType = 'repositories';
        
        result[componentType].push({
          source: file,
          test: testFile
        });
      }
    }
  }
  
  return result;
}

/**
 * Get all TypeScript source files in a directory (recursively)
 * @param {string} dir Directory to scan
 * @returns {string[]} Array of file paths
 */
function getSourceFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...getSourceFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && 
              !entry.name.endsWith('.d.ts') && 
              !entry.name.endsWith('.test.ts') &&
              !entry.name.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Analyze a TypeScript file to determine its exports and structure
 * @param {string} filePath Path to the TypeScript file
 * @returns {Object} Information about the file
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const result = {
    hasClasses: false,
    classes: [],
    hasFunctions: false,
    functions: [],
    hasInterfaces: false,
    interfaces: [],
    hasConstants: false,
    constants: []
  };
  
  // Simple regex-based analysis (this is a basic version and doesn't handle all edge cases)
  const classMatches = content.match(/export\s+class\s+(\w+)/g);
  if (classMatches) {
    result.hasClasses = true;
    result.classes = classMatches.map(match => match.replace(/export\s+class\s+/, ''));
  }
  
  const functionMatches = content.match(/export\s+(?:async\s+)?function\s+(\w+)/g);
  if (functionMatches) {
    result.hasFunctions = true;
    result.functions = functionMatches.map(match => 
      match.replace(/export\s+(?:async\s+)?function\s+/, ''));
  }
  
  const arrowFunctionMatches = content.match(/export\s+const\s+(\w+)\s+=\s+(?:async\s+)?\(/g);
  if (arrowFunctionMatches) {
    result.hasFunctions = true;
    result.functions.push(...arrowFunctionMatches.map(match => 
      match.replace(/export\s+const\s+/, '').replace(/\s+=\s+(?:async\s+)?\(/, '')));
  }
  
  const interfaceMatches = content.match(/export\s+interface\s+(\w+)/g);
  if (interfaceMatches) {
    result.hasInterfaces = true;
    result.interfaces = interfaceMatches.map(match => match.replace(/export\s+interface\s+/, ''));
  }
  
  const constMatches = content.match(/export\s+const\s+(\w+)\s+=\s+[^(]/g);
  if (constMatches) {
    result.hasConstants = true;
    result.constants = constMatches.map(match => 
      match.replace(/export\s+const\s+/, '').replace(/\s+=\s+[^(].*/, ''));
  }
  
  return result;
}

/**
 * Generate a test file for a source file
 * @param {Object} fileInfo Object with source and test file paths
 * @param {string} componentType Type of the component
 */
function generateTestFile(fileInfo, componentType) {
  const { source, test } = fileInfo;
  
  // Create the test directory if it doesn't exist
  const testDir = path.dirname(test);
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  // Get the import path (relative path from test to source)
  const importPath = path.relative(path.dirname(test), source).replace(/\.ts$/, '');
  
  // Analyze the source file
  const analysis = analyzeFile(source);
  const fileName = path.basename(source, '.ts');
  
  let testContent = '';
  
  if (analysis.hasClasses) {
    testContent = generateClassTestTemplate(fileName, analysis.classes[0], importPath, componentType);
  } else if (analysis.hasFunctions) {
    testContent = generateFunctionTestTemplate(fileName, analysis.functions[0], importPath, componentType);
  } else {
    // Default template
    testContent = `import { describe, it, expect } from '@jest/globals';
import * as ${fileName.replace(/-/g, '_')} from '${importPath}';

describe('${fileName}', () => {
  it('should be defined', () => {
    expect(${fileName.replace(/-/g, '_')}).toBeDefined();
  });
  
  // Add more tests for this module
});
`;
  }
  
  fs.writeFileSync(test, testContent);
  console.log(`✅ Created test file: ${test}`);
}

/**
 * Generate a test template for a class
 * @param {string} fileName Name of the source file (without extension)
 * @param {string} className Name of the class
 * @param {string} importPath Relative path to import the source file
 * @param {string} componentType Type of the component
 * @returns {string} Test file content
 */
function generateClassTestTemplate(fileName, className, importPath, componentType) {
  if (componentType === 'services' || componentType === 'adapters') {
    return `import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ${className} } from '${importPath}';

describe('${className}', () => {
  let ${fileName.toLowerCase()}: ${className};
  let mockDependency1: jest.Mocked<any>;
  let mockDependency2: jest.Mocked<any>;
  
  beforeEach(() => {
    // Create mocks for dependencies
    mockDependency1 = {
      method1: jest.fn(),
      method2: jest.fn()
    };
    
    mockDependency2 = {
      method1: jest.fn(),
      method2: jest.fn()
    };
    
    // Initialize the service with mocks
    ${fileName.toLowerCase()} = new ${className}(
      mockDependency1 as any,
      mockDependency2 as any
    );
  });
  
  describe('methodName', () => {
    it('should process valid inputs correctly', async () => {
      // Arrange
      const input = { /* test input */ };
      mockDependency1.method1.mockResolvedValue({ /* mocked response */ });
      
      // Act
      const result = await ${fileName.toLowerCase()}.methodName(input);
      
      // Assert
      expect(result).toBeDefined();
      expect(mockDependency1.method1).toHaveBeenCalledWith(expect.any(Object));
    });
    
    it('should handle errors appropriately', async () => {
      // Arrange
      mockDependency1.method1.mockRejectedValue(new Error('Test error'));
      
      // Act & Assert
      await expect(${fileName.toLowerCase()}.methodName({})).rejects.toThrow('Test error');
    });
  });
  
  describe('anotherMethod', () => {
    it('should handle edge cases', () => {
      // Test implementation
    });
  });
});
`;
  } else {
    // Domain/Core class
    return `import { describe, it, expect } from '@jest/globals';
import { ${className} } from '${importPath}';

describe('${className}', () => {
  describe('constructor', () => {
    it('should create a valid instance with correct properties', () => {
      // Arrange
      const props = {
        // Add required properties for constructor
      };
      
      // Act
      const instance = new ${className}(props);
      
      // Assert
      expect(instance).toBeInstanceOf(${className});
      // Add more specific assertions for properties
    });
    
    it('should throw an error if invalid properties are provided', () => {
      // Arrange
      const invalidProps = {
        // Add invalid properties
      };
      
      // Act & Assert
      expect(() => new ${className}(invalidProps)).toThrow();
    });
  });
  
  describe('methods', () => {
    it('should correctly execute method behavior', () => {
      // Arrange
      const instance = new ${className}({
        // Required properties
      });
      
      // Act
      const result = instance.someMethod();
      
      // Assert
      expect(result).toBeDefined();
      // Add more specific assertions
    });
  });
});
`;
  }
}

/**
 * Generate a test template for a function
 * @param {string} fileName Name of the source file (without extension)
 * @param {string} functionName Name of the function
 * @param {string} importPath Relative path to import the source file
 * @param {string} componentType Type of the component
 * @returns {string} Test file content
 */
function generateFunctionTestTemplate(fileName, functionName, importPath, componentType) {
  if (componentType === 'core' || componentType === 'utils') {
    // Pure function
    return `import { describe, it, expect } from '@jest/globals';
import { ${functionName} } from '${importPath}';

describe('${functionName}', () => {
  it('should correctly process valid inputs', () => {
    // Test cases with various inputs and expected outputs
    const testCases = [
      { input: [/* test input */], expected: /* expected result */ },
      { input: [/* another test input */], expected: /* another expected result */ },
    ];
    
    testCases.forEach(({ input, expected }) => {
      expect(${functionName}(...input)).toEqual(expected);
    });
  });
  
  it('should handle edge cases properly', () => {
    // Test edge cases
    expect(${functionName}(/* edge case input */)).toEqual(/* expected result */);
    
    // Empty/minimal inputs
    expect(${functionName}(/* minimal input */)).toEqual(/* expected result */);
  });
  
  it('should throw for invalid inputs', () => {
    // Test invalid inputs
    expect(() => ${functionName}(/* invalid input */)).toThrow();
  });
});
`;
  } else {
    // Function with side effects
    return `import { describe, it, expect, jest } from '@jest/globals';
import { ${functionName} } from '${importPath}';

// Mock dependencies
jest.mock('external-dependency', () => ({
  externalFunction: jest.fn(),
}));

describe('${functionName}', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });
  
  it('should correctly process inputs and interact with dependencies', async () => {
    // Arrange
    const input = { /* test input */ };
    const mockDependency = require('external-dependency');
    mockDependency.externalFunction.mockResolvedValue({ /* mock result */ });
    
    // Act
    const result = await ${functionName}(input);
    
    // Assert
    expect(result).toBeDefined();
    expect(mockDependency.externalFunction).toHaveBeenCalledWith(expect.any(Object));
  });
  
  it('should handle errors from dependencies', async () => {
    // Arrange
    const mockDependency = require('external-dependency');
    mockDependency.externalFunction.mockRejectedValue(new Error('Dependency error'));
    
    // Act & Assert
    await expect(${functionName}(/* input */)).rejects.toThrow('Dependency error');
  });
});
`;
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  let filesFilter = null;
  let componentTypeFilter = null;
  let checkOnly = false;
  
  // Parse command-line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--files' && i + 1 < args.length) {
      filesFilter = args[i + 1];
      i++;
    } else if (args[i] === '--component' && i + 1 < args.length) {
      componentTypeFilter = args[i + 1];
      i++;
    } else if (args[i] === '--check') {
      checkOnly = true;
    }
  }
  
  if (!checkOnly) {
    console.log('🧪 Generating test files...');
  }
  
  // Find source files without tests
  const sourceFilesWithoutTests = findSourceFilesWithoutTests();
  
  // Count total files without tests
  let totalCount = 0;
  for (const type in sourceFilesWithoutTests) {
    totalCount += sourceFilesWithoutTests[type].length;
  }
  
  console.log(`Found ${totalCount} source files without tests`);
  
  // If we're only checking, exit here with a summary
  if (checkOnly) {
    if (totalCount === 0) {
      console.log('✅ All source files have corresponding test files');
      return;
    }
    
    // Print summary of missing tests by component type
    for (const type in sourceFilesWithoutTests) {
      const files = sourceFilesWithoutTests[type];
      if (files.length === 0) continue;
      
      console.log(`\n${type.toUpperCase()} (${files.length} files):`);
      for (const file of files) {
        console.log(`- ${file.source}`);
      }
    }
    
    console.log(`\nTest coverage thresholds:`);
    for (const type in COVERAGE_THRESHOLDS) {
      console.log(`- ${type}: ${COVERAGE_THRESHOLDS[type]}% lines`);
    }
    return;
  }
  
  // Generate test files
  for (const type in sourceFilesWithoutTests) {
    if (componentTypeFilter && type !== componentTypeFilter) {
      continue;
    }
    
    const files = sourceFilesWithoutTests[type];
    if (files.length === 0) {
      continue;
    }
    
    console.log(`\n${type.toUpperCase()} (${files.length} files):`);
    
    for (const file of files) {
      if (filesFilter && !file.source.includes(filesFilter)) {
        continue;
      }
      
      console.log(`- ${file.source}`);
      generateTestFile(file, type);
    }
  }
  
  console.log('\n✅ Test generation complete');
  console.log(`Test coverage thresholds:`);
  for (const type in COVERAGE_THRESHOLDS) {
    console.log(`- ${type}: ${COVERAGE_THRESHOLDS[type]}% lines`);
  }
}

// Run the script
main();
