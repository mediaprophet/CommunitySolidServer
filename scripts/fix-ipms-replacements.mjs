/* eslint-disable require-unicode-regexp, regexp/no-unused-capturing-group */
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = 'c:\\Projects\\CommunitySolidServer';
const DATABOX_DIR = path.join(ROOT_DIR, 'databox');
const SCRIPTS_DIR = path.join(ROOT_DIR, 'scripts');
const TEST_DIR = path.join(ROOT_DIR, 'test');

function renameDirIfExist(oldPath, newPath) {
  if (fs.existsSync(oldPath)) {
    console.log(`Renaming directory: ${oldPath} -> ${newPath}`);
    fs.renameSync(oldPath, newPath);
  }
}

// Rename databox/deployment/ipms to ipms
renameDirIfExist(path.join(DATABOX_DIR, 'deployment', 'ipms'), path.join(DATABOX_DIR, 'deployment', 'ipms'));
// Rename docker-compose.ipms.yml to docker-compose.ipms.yml
const composeOld = path.join(DATABOX_DIR, 'deployment', 'ipms', 'docker-compose.ipms.yml');
const composeNew = path.join(DATABOX_DIR, 'deployment', 'ipms', 'docker-compose.ipms.yml');
if (fs.existsSync(composeOld)) {
  fs.renameSync(composeOld, composeNew);
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if ([ 'node_modules', 'dist', '.git', 'coverage', '.gemini' ].includes(file)) {
      continue;
    }
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else {
      // Rename file if needed
      let currentPath = fullPath;
      if (file.includes('Ipms') || file.includes('ipms')) {
        const newName = file.replaceAll('Ipms', 'Ipms').replaceAll('ipms', 'ipms');
        const newPath = path.join(dir, newName);
        console.log(`Renaming file: ${currentPath} -> ${newPath}`);
        fs.renameSync(currentPath, newPath);
        currentPath = newPath;
      }

      if (/\.(ts|tsx|json|js|mjs|md|html|yml|yaml|jsonld|ttl)$/.test(currentPath)) {
        const content = fs.readFileSync(currentPath, 'utf8');
        const newContent = content
          .replaceAll(/\bIpms\b/g, 'Ipms')
          .replaceAll(/\bcms\b/g, 'ipms')
          .replaceAll(/\bCMS\b/g, 'IPMS')
          .replaceAll(/Ipms([A-Z])/g, 'Ipms$1')
          .replaceAll(/ipms([A-Z])/g, 'ipms$1')
          .replaceAll(/([a-z])Ipms\b/g, '$1Ipms');
        if (content !== newContent) {
          console.log(`Updating contents of: ${currentPath}`);
          fs.writeFileSync(currentPath, newContent, 'utf8');
        }
      }
    }
  }
}

walkDir(DATABOX_DIR);
walkDir(SCRIPTS_DIR);
walkDir(TEST_DIR);
