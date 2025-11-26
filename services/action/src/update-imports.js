const fs = require('fs');
const path = require('path');

const extensions = ['.ts', '.js', '.d.ts'];

function updateImportsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Skip if it's a .d.ts file
  if (filePath.endsWith('.d.ts')) {
    return;
  }

  // Update relative imports to include .js extension
  const updatedContent = content.replace(
    /from\s+['"](\..*?)(?:\.(?:js|ts|d\.ts))?['"]/g,
    (match, importPath) => {
      // Skip node_modules imports
      if (importPath.startsWith('node:')) return match;
      
      // Skip built-in modules
      const builtIns = ['path', 'fs', 'os', 'http', 'https', 'url', 'util', 'stream'];
      if (builtIns.includes(importPath)) return match;
      
      // Skip imports that already have an extension
      if (importPath.endsWith('.js') || importPath.endsWith('.d.ts')) return match;
      
      // Add .js extension to relative imports
      if (importPath.startsWith('.')) {
        return `from '${importPath}.js'`;
      }
      
      return match;
    }
  );

  if (content !== updatedContent) {
    fs.writeFileSync(filePath, updatedContent, 'utf-8');
    console.log(`Updated imports in ${filePath}`);
  }
}

function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  
  files.forEach(file => {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (extensions.includes(path.extname(file))) {
      updateImportsInFile(fullPath);
    }
  });
}

// Start processing from the src directory
const srcDir = path.join(__dirname, 'src');
processDirectory(srcDir);
