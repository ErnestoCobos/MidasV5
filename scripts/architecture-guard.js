#!/usr/bin/env node

/**
 * Architecture Guard for MidasTS
 * 
 * This script verifies that the codebase adheres to the hexagonal architecture
 * rules defined in the project.
 * 
 * Key rules:
 * 1. Core domain cannot import from adapters or infrastructure
 * 2. Adapters must implement ports (interfaces)
 * 3. No circular dependencies between layers
 * 4. FP for analysis, OOP for services and adapters
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const RULES = {
  CORE_CANNOT_IMPORT_ADAPTERS: true,
  CORE_CANNOT_IMPORT_INFRA: true,
  ADAPTERS_MUST_IMPLEMENT_PORTS: true,
  PORTS_ONLY_INTERFACES: true,
  CIRCULAR_DEPENDENCIES_NOT_ALLOWED: true
};

const SEVERITY = {
  import_violation: 'error',
  core_adapter_import: 'error',
  port_implementation_missing: 'warn',
  folder_mismatch: 'warn',
  naming: 'warn',
  circular: 'error',
  mixed_responsibilities: 'warn',
  deepseek_direct_import: 'error',
  service_without_interface: 'warn'
};

const ALLOWED_EXCEPTIONS = [
  { pattern: "infrastructure/di/**" },
  { pattern: "tests/**" },
  { pattern: "core/utils/testHelpers.ts" },
  { pattern: "**/index.ts" },
  { pattern: "simple-test.js" }
];

const IGNORE_PATTERNS = [
  "**/*.spec.ts",
  "**/*.test.ts",
  "**/mocks/**",
  "**/node_modules/**"
];

let violations = [];

/**
 * Checks if a file matches any of the given patterns
 */
function matchesPattern(filePath, patterns) {
  return patterns.some(p => {
    const pattern = p.pattern || p;
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\//g, '\\/');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  });
}

/**
 * Analyzes imports in TypeScript files to find architecture violations
 */
function analyzeFile(filePath) {
  if (matchesPattern(filePath, IGNORE_PATTERNS)) {
    return;
  }
  
  if (matchesPattern(filePath, ALLOWED_EXCEPTIONS)) {
    return;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Check imports
    const importLines = lines.filter(line => line.trim().startsWith('import '));
    
    // Check if this is a core file
    const isCore = filePath.includes('/core/');
    
    // Check if this is an adapter file
    const isAdapter = filePath.includes('/adapters/');
    
    // Check core importing adapters or infrastructure
    if (isCore) {
      importLines.forEach((line, index) => {
        if (line.includes('/adapters/')) {
          violations.push({
            file: filePath,
            line: index + 1,
            type: 'core_adapter_import',
            message: 'Core module imports adapter directly. Should import from ports instead.'
          });
        }
        
        if (line.includes('/infrastructure/')) {
          violations.push({
            file: filePath,
            line: index + 1,
            type: 'core_import_violation',
            message: 'Core module imports infrastructure directly. Should import from ports instead.'
          });
        }
        
        if (line.includes('/services/deepseek')) {
          violations.push({
            file: filePath,
            line: index + 1,
            type: 'deepseek_direct_import',
            message: 'Direct import from DeepSeek service. Should import from ports/deepseek.ts instead.'
          });
        }
      });
    }
    
    // Check adapter implementing ports
    if (isAdapter) {
      const implementsPort = content.includes('implements ') && content.includes('/ports/');
      if (!implementsPort) {
        violations.push({
          file: filePath,
          line: 0,
          type: 'port_implementation_missing',
          message: 'Adapter does not implement a port interface from /ports/ directory.'
        });
      }
    }
    
    // Check OOP vs FP paradigm
    if (filePath.includes('/core/analysis/') || filePath.includes('/core/math/')) {
      if (content.includes('class ') && (content.includes(' private ') || content.includes(' public '))) {
        violations.push({
          file: filePath,
          line: 0,
          type: 'folder_mismatch',
          message: 'Core analysis/math modules should use functional paradigm, not OOP classes.'
        });
      }
    }
    
    // Check service interfaces
    if (filePath.includes('/services/') && !filePath.includes('.test.')) {
      const serviceName = path.basename(filePath, '.ts');
      const hasInterface = content.includes('implements ') && content.includes('/ports/');
      if (!hasInterface) {
        violations.push({
          file: filePath,
          line: 0,
          type: 'service_without_interface',
          message: `Service ${serviceName} does not implement an interface from /ports/ directory.`
        });
      }
    }
  } catch (error) {
    console.error(`Error analyzing file ${filePath}:`, error.message);
  }
}

/**
 * Recursively traverse directories to analyze all TypeScript files
 */
function traverseDirectory(dir) {
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        traverseDirectory(filePath);
      } else if (stat.isFile() && (filePath.endsWith('.ts') || filePath.endsWith('.tsx'))) {
        analyzeFile(filePath);
      }
    }
  } catch (error) {
    console.error(`Error traversing directory ${dir}:`, error.message);
  }
}

/**
 * Check for circular dependencies using madge
 */
function checkCircularDependencies() {
  try {
    execSync('npx madge --circular --extensions ts src', { stdio: 'pipe' });
  } catch (error) {
    const output = error.stdout.toString();
    if (output.includes('Circular dependencies detected')) {
      violations.push({
        file: 'N/A',
        line: 0,
        type: 'circular',
        message: 'Circular dependencies detected: ' + output
      });
    }
  }
}

// Main execution
console.log('🏗️ Running Architecture Guard for MidasTS...');

// Analyze source files
traverseDirectory('src');

// Check for circular dependencies
if (RULES.CIRCULAR_DEPENDENCIES_NOT_ALLOWED) {
  checkCircularDependencies();
}

// Print violations grouped by severity
const errorViolations = violations.filter(v => SEVERITY[v.type] === 'error');
const warnViolations = violations.filter(v => SEVERITY[v.type] === 'warn');

if (errorViolations.length > 0) {
  console.error('\n❌ Architecture violations (errors):');
  errorViolations.forEach(v => {
    console.error(`${v.file}:${v.line} -> ${v.message}`);
  });
}

if (warnViolations.length > 0) {
  console.warn('\n⚠️ Architecture warnings:');
  warnViolations.forEach(v => {
    console.warn(`${v.file}:${v.line} -> ${v.message}`);
  });
}

if (violations.length === 0) {
  console.log('✅ Architecture check passed!');
  process.exit(0);
} else {
  console.log(`\nTotal: ${errorViolations.length} errors, ${warnViolations.length} warnings`);
  if (errorViolations.length > 0) {
    process.exit(1);
  }
}
