/**
 * Documentation Update Script
 * 
 * This script updates documentation files in the Diátaxis format based on changes to source files.
 * It follows rule 45-docs-update.md to generate/update docs when source files change.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Mapping from source directories to documentation directories (Diátaxis format)
const SOURCE_TO_DOCS_MAPPING = {
  'src/core/': 'docs/explanations/',
  'src/services/': 'docs/how-to/',
  'src/adapters/': 'docs/how-to/',
  'src/utils/': 'docs/how-to/',
  'src/strategies/': 'docs/explanations/'
};

// Special files that have dedicated documentation
const SPECIAL_MAPPINGS = {
  'src/services/portfolio-manager.ts': 'docs/explanations/portfolio-manager.md',
  'src/services/telegram.ts': 'docs/how-to/telegram-integration.md',
  'src/services/deepseek.ts': 'docs/explanations/deepseek-integration.md',
  'src/services/market-scanner.ts': 'docs/explanations/market-scanner.md'
};

/**
 * Get the list of changed files compared to origin/main
 * @returns {string[]} Array of changed file paths
 */
function getChangedFiles() {
  try {
    const output = execSync('git diff --name-only origin/main...HEAD').toString();
    return output.split('\n').filter(line => line.trim() !== '');
  } catch (error) {
    console.error('Failed to get changed files:', error.message);
    return [];
  }
}

/**
 * Generate API reference using TypeDoc
 */
function generateApiReference() {
  console.log('Generating API reference...');
  try {
    execSync('npx typedoc', { stdio: 'inherit' });
    console.log('✅ API reference generated successfully');
  } catch (error) {
    console.error('❌ Failed to generate API reference:', error.message);
  }
}

/**
 * Update documentation for a source file
 * @param {string} sourceFile Path to the source file
 */
function updateDocumentationForFile(sourceFile) {
  // Skip non-TypeScript/JavaScript files
  if (!sourceFile.match(/\.(ts|js)$/)) {
    return;
  }
  
  let docFile = null;
  
  // Check if this file has a special mapping
  if (SPECIAL_MAPPINGS[sourceFile]) {
    docFile = SPECIAL_MAPPINGS[sourceFile];
  } else {
    // Find the appropriate documentation directory
    for (const [srcDir, docDir] of Object.entries(SOURCE_TO_DOCS_MAPPING)) {
      if (sourceFile.startsWith(srcDir)) {
        // Convert path/to/file.ts to path-to-file.md
        const baseName = path.basename(sourceFile, path.extname(sourceFile));
        docFile = `${docDir}${baseName}.md`;
        break;
      }
    }
  }
  
  if (!docFile) {
    console.log(`⚠️ No documentation mapping for ${sourceFile}`);
    return;
  }
  
  // Ensure the directory exists
  const docDir = path.dirname(docFile);
  if (!fs.existsSync(docDir)) {
    fs.mkdirSync(docDir, { recursive: true });
    console.log(`📁 Created directory: ${docDir}`);
  }
  
  // Create or update the documentation file
  if (!fs.existsSync(docFile)) {
    createDocumentationFile(sourceFile, docFile);
  } else {
    updateExistingDocumentation(sourceFile, docFile);
  }
}

/**
 * Create a new documentation file
 * @param {string} sourceFile Path to the source file
 * @param {string} docFile Path to the documentation file
 */
function createDocumentationFile(sourceFile, docFile) {
  const sourceContent = fs.readFileSync(sourceFile, 'utf-8');
  const fileName = path.basename(sourceFile, path.extname(sourceFile));
  const fileType = path.extname(sourceFile).substring(1); // Remove the leading dot
  
  // Determine the documentation type based on the mapping
  let docType = 'explanation';
  for (const [srcDir, docDir] of Object.entries(SOURCE_TO_DOCS_MAPPING)) {
    if (docFile.startsWith(docDir)) {
      docType = docDir.includes('/how-to/') ? 'how-to' : 'explanation';
      break;
    }
  }
  
  let title = fileName
    .replace(/([A-Z])/g, ' $1') // Add spaces before capital letters
    .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
    .trim();
  
  let templateContent;
  
  if (docType === 'how-to') {
    templateContent = `# How to Use the ${title}

## Overview

This guide explains how to use the \`${fileName}\` ${fileType === 'ts' ? 'class' : 'module'} in the MidasTS system.

## Prerequisites

- Basic understanding of MidasTS architecture
- [Configuration setup](./database-setup.md)

## Usage

\`\`\`typescript
// Example usage code here
\`\`\`

## Common Tasks

### Task 1: [Description]

\`\`\`typescript
// Example code for task 1
\`\`\`

### Task 2: [Description]

\`\`\`typescript
// Example code for task 2
\`\`\`

## Troubleshooting

- **Problem**: [Common issue]
  - **Solution**: [How to fix]

## Related

- [Related Documentation 1](./related-doc-1.md)
- [Related Documentation 2](./related-doc-2.md)

## Recent Changes

This documentation was generated automatically on ${new Date().toISOString().split('T')[0]}.
`;
  } else {
    templateContent = `# ${title}

## Introduction

This document explains the concepts and implementation details of the \`${fileName}\` module in MidasTS.

## Key Concepts

- Concept 1: Description
- Concept 2: Description
- Concept 3: Description

## Architecture

\`\`\`mermaid
flowchart TD
    A[Component A] --> B[${title}]
    B --> C[Component C]
    B --> D[Component D]
\`\`\`

## Implementation Details

### Core Functionality

\`\`\`typescript
// Example code snippet
\`\`\`

### Algorithms

The ${title} uses the following algorithms:

1. Algorithm 1
2. Algorithm 2

## Design Decisions

- Decision 1: Rationale
- Decision 2: Rationale

## Recent Changes

This documentation was generated automatically on ${new Date().toISOString().split('T')[0]}.
`;
  }
  
  fs.writeFileSync(docFile, templateContent);
  console.log(`✅ Created documentation file: ${docFile}`);
}

/**
 * Update an existing documentation file
 * @param {string} sourceFile Path to the source file
 * @param {string} docFile Path to the documentation file
 */
function updateExistingDocumentation(sourceFile, docFile) {
  const docContent = fs.readFileSync(docFile, 'utf-8');
  const sourceContent = fs.readFileSync(sourceFile, 'utf-8');
  
  // Get a diff of the changes
  let diff;
  try {
    diff = execSync(`git diff -U0 --no-color HEAD~1 "${sourceFile}"`).toString();
  } catch (error) {
    console.log(`⚠️ Could not get diff for ${sourceFile}: ${error.message}`);
    diff = 'No diff available';
  }
  
  // Create a changes section
  const changesSection = `
## Recent Changes

_Updated on ${new Date().toISOString().split('T')[0]}_

\`\`\`diff
${diff}
\`\`\`
`;
  
  // Check if there's already a "Recent Changes" section
  if (docContent.includes('## Recent Changes')) {
    // Replace the existing section
    const updatedContent = docContent.replace(
      /## Recent Changes[\s\S]*?(?=##|$)/,
      changesSection
    );
    fs.writeFileSync(docFile, updatedContent);
  } else {
    // Append the changes section
    fs.writeFileSync(docFile, docContent + '\n' + changesSection);
  }
  
  console.log(`✅ Updated documentation file: ${docFile}`);
}

/**
 * Update badges for documentation
 */
function updateBadges() {
  console.log('Updating documentation badges...');
  
  // Generate coverage badge
  try {
    execSync('npm run coverage:badge', { stdio: 'inherit' });
    console.log('✅ Coverage badge updated');
  } catch (error) {
    console.error('❌ Failed to update coverage badge:', error.message);
  }
  
  // Create version badge
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    const version = packageJson.version;
    const versionBadge = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="90" height="20" role="img" aria-label="version: ${version}"><title>version: ${version}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="90" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="51" height="20" fill="#555"/><rect x="51" width="39" height="20" fill="#007ec6"/><rect width="90" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110"><text aria-hidden="true" x="265" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="410">version</text><text x="265" y="140" transform="scale(.1)" fill="#fff" textLength="410">version</text><text aria-hidden="true" x="695" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="290">${version}</text><text x="695" y="140" transform="scale(.1)" fill="#fff" textLength="290">${version}</text></g></svg>`;
    
    fs.writeFileSync('docs/badges/version.svg', versionBadge);
    console.log('✅ Version badge updated');
  } catch (error) {
    console.error('❌ Failed to update version badge:', error.message);
  }
}

/**
 * Main function
 */
function main() {
  console.log('📝 Updating documentation...');
  
  // Generate API reference
  generateApiReference();
  
  // Get changed files
  const changedFiles = getChangedFiles();
  console.log(`Found ${changedFiles.length} changed files`);
  
  // Update documentation for each changed file
  for (const file of changedFiles) {
    if (file.startsWith('src/')) {
      updateDocumentationForFile(file);
    }
  }
  
  // Update badges
  updateBadges();
  
  // Update main README's table of contents
  try {
    execSync('npx markdown-toc -i docs/README.md', { stdio: 'inherit' });
    console.log('✅ Table of contents updated');
  } catch (error) {
    console.error('❌ Failed to update table of contents:', error.message);
  }
  
  console.log('📚 Documentation update complete');
}

main();
