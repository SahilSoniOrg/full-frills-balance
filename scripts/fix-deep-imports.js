const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');
const appDir = path.join(__dirname, '../app');

function getAllFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (filePath.includes('__tests__')) {
            continue; // Skip tests for now as they often use internal imports directly
        }
        if (fs.statSync(filePath).isDirectory()) {
            getAllFiles(filePath, fileList);
        } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

const allFiles = [...getAllFiles(srcDir), ...getAllFiles(appDir)];

// Regex to find deep imports: strictly bounded inside the quotes
const importRegex = /import\s+({[^}]+}|\s*[A-Za-z0-9_]+\s*|\*\s+as\s+[A-Za-z0-9_]+)\s+from\s+['"]@\/src\/features\/([^/'"]+)\/([^'"]+)['"];?/g;

const featureExports = {};

for (const file of allFiles) {
    let content = fs.readFileSync(file, 'utf8');
    let hasChanges = false;

    let currentFeature = null;
    const match = file.match(/\/src\/features\/([^/]+)/);
    if (match) {
        currentFeature = match[1];
    }

    const newContent = content.replace(importRegex, (match, importsStr, featureName, deepPath) => {
        if (currentFeature === featureName) {
            return match;
        }

        hasChanges = true;

        if (!featureExports[featureName]) {
            featureExports[featureName] = new Set();
        }

        const isDefault = !importsStr.includes('{') && !importsStr.includes('*');
        if (isDefault) {
            const defaultName = importsStr.trim();
            featureExports[featureName].add(`export { default as ${defaultName} } from './${deepPath}';`);
        } else {
            featureExports[featureName].add(`export ${importsStr} from './${deepPath}';`);
        }

        return `import ${importsStr} from '@/src/features/${featureName}';`;
    });

    if (hasChanges) {
        fs.writeFileSync(file, newContent, 'utf8');
        console.log(`Updated ${file}`);
    }
}

// Now update all the index.ts files
for (const [feature, exportsSet] of Object.entries(featureExports)) {
    const indexPath = path.join(srcDir, 'features', feature, 'index.ts');
    let indexContent = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';

    const newExports = Array.from(exportsSet).filter(exp => !indexContent.includes(exp));

    if (newExports.length > 0) {
        const updatedContent = indexContent + (indexContent.endsWith('\n') ? '' : '\n') + newExports.join('\n') + '\n';
        fs.writeFileSync(indexPath, updatedContent, 'utf8');
        console.log(`Updated index.ts for feature: ${feature}`);
    }
}
