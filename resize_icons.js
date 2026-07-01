const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

if (process.platform !== 'darwin') {
  console.log('Not on macOS (Darwin). Skipping iOS icon resizing script.');
  process.exit(0);
}

function findContentsJson(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file === 'AppIcon.appiconset') {
        const jsonPath = path.join(fullPath, 'Contents.json');
        if (fs.existsSync(jsonPath)) {
          return jsonPath;
        }
      }
      const found = findContentsJson(fullPath);
      if (found) return found;
    }
  }
  return null;
}

const iosDir = path.join('platforms', 'ios');
const contentsJsonPath = findContentsJson(iosDir);

if (!contentsJsonPath) {
  console.error('ERROR: Contents.json inside AppIcon.appiconset not found under platforms/ios');
  process.exit(1);
}

const sourceIcon = fs.existsSync('BVicon.png') ? 'BVicon.png' : path.join('www', 'img', 'bvicon.png');
console.log(`Found Contents.json at: ${contentsJsonPath}`);
console.log(`Using source icon: ${sourceIcon}`);

const contents = JSON.parse(fs.readFileSync(contentsJsonPath, 'utf8'));
const appiconsetDir = path.dirname(contentsJsonPath);

contents.images.forEach((img) => {
  if (!img.filename) return;

  const sizeStr = img.size.split('x')[0];
  const scaleStr = img.scale.replace('x', '');
  
  const size = parseFloat(sizeStr);
  const scale = parseFloat(scaleStr);
  const targetPx = Math.round(size * scale);

  const targetPath = path.join(appiconsetDir, img.filename);
  console.log(`Resizing to ${targetPx}x${targetPx} -> ${img.filename}`);
  
  try {
    execSync(`sips -z ${targetPx} ${targetPx} "${sourceIcon}" --out "${targetPath}"`);
  } catch (err) {
    console.error(`Failed to resize ${img.filename}:`, err.message);
  }
});

console.log('All icons resized successfully!');
