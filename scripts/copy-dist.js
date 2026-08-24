// scripts/copy-dist.js - Cross-platform assets copy script
import fs from 'fs';
import path from 'path';

const filesToCopy = [

  'manifest.json',
  'service-worker.js',
  'version.json',
  'offline.html'
];

const dirsToCopy = [
  'css',
  'js',
  'icons'
];

const destDir = 'dist';

// Ensure destDir exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// Copy files
filesToCopy.forEach(file => {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(destDir, file));
    console.log(`Copied ${file} to ${destDir}`);
  } else {
    console.warn(`Warning: File not found: ${file}`);
  }
});

// Copy directories recursively
dirsToCopy.forEach(dir => {
  if (fs.existsSync(dir)) {
    fs.mkdirSync(path.join(destDir, dir), { recursive: true });
    copyDir(dir, path.join(destDir, dir));
    console.log(`Copied directory ${dir} to ${destDir}`);
  } else {
    console.warn(`Warning: Directory not found: ${dir}`);
  }
});

function copyDir(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('🎉 Assets copied to dist/ successfully!');
