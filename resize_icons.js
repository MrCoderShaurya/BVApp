const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

if (process.platform !== 'darwin') {
  console.log('Not on macOS (Darwin). Skipping iOS icon resizing script.');
  process.exit(0);
}

const contentsJsonPath = path.join('platforms', 'ios', 'Bhakti Vedanta App', 'Images.xcassets', 'AppIcon.appiconset', 'Contents.json');
const sourceIcon = fs.existsSync('BVicon.png') ? 'BVicon.png' : path.join('www', 'img', 'bvicon.png');

if (!fs.existsSync(contentsJsonPath)) {
  console.error('ERROR: Contents.json not found at:', contentsJsonPath);
  process.exit(1);
}

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
