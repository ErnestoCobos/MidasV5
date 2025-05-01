#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Path to the lcov.info file
const lcovPath = path.join(process.cwd(), 'coverage', 'lcov.info');
// Path to output the JSON summary
const outputPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

// Check if the lcov.info file exists
if (!fs.existsSync(lcovPath)) {
  console.error('lcov.info file not found! Run tests with coverage first.');
  process.exit(1);
}

// Read the lcov.info file
const lcovContent = fs.readFileSync(lcovPath, 'utf8');

// Parse the content to extract coverage information
const lines = lcovContent.split('\n');
let totalLines = 0;
let coveredLines = 0;
let totalFunctions = 0;
let coveredFunctions = 0;
let totalBranches = 0;
let coveredBranches = 0;
let totalStatements = 0;
let coveredStatements = 0;

let currentFile = null;

for (const line of lines) {
  if (line.startsWith('SF:')) {
    currentFile = line.substring(3);
  } else if (line.startsWith('FNF:')) {
    totalFunctions += parseInt(line.substring(4), 10);
  } else if (line.startsWith('FNH:')) {
    coveredFunctions += parseInt(line.substring(4), 10);
  } else if (line.startsWith('LF:')) {
    totalLines += parseInt(line.substring(3), 10);
  } else if (line.startsWith('LH:')) {
    coveredLines += parseInt(line.substring(3), 10);
  } else if (line.startsWith('BRF:')) {
    totalBranches += parseInt(line.substring(4), 10);
  } else if (line.startsWith('BRH:')) {
    coveredBranches += parseInt(line.substring(4), 10);
  }
}

// Calculate percentages
const linePct = totalLines > 0 ? (coveredLines / totalLines) * 100 : 0;
const fnPct = totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0;
const branchPct = totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0;
const stmtPct = totalLines > 0 ? (coveredLines / totalLines) * 100 : 0;

// Create the summary object
const summary = {
  total: {
    lines: {
      total: totalLines,
      covered: coveredLines,
      pct: parseFloat(linePct.toFixed(2))
    },
    functions: {
      total: totalFunctions,
      covered: coveredFunctions,
      pct: parseFloat(fnPct.toFixed(2))
    },
    branches: {
      total: totalBranches,
      covered: coveredBranches,
      pct: parseFloat(branchPct.toFixed(2))
    },
    statements: {
      total: totalStatements,
      covered: coveredStatements,
      pct: parseFloat(stmtPct.toFixed(2))
    }
  }
};

// Write the summary to file
fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
console.log(`Coverage summary written to ${outputPath}`);
