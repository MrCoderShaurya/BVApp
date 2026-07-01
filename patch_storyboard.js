const fs = require('fs');
const path = require('path');

function findStoryboard(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const found = findStoryboard(fullPath);
      if (found) return found;
    } else if (file === 'CDVLaunchScreen.storyboard') {
      return fullPath;
    }
  }
  return null;
}

const iosDir = path.join('platforms', 'ios');
const storyboardPath = findStoryboard(iosDir);

if (storyboardPath && fs.existsSync(storyboardPath)) {
  console.log(`Found CDVLaunchScreen.storyboard at: ${storyboardPath}. Patching for iOS 9 compatibility...`);
  let content = fs.readFileSync(storyboardPath, 'utf8');
  
  // Find all color tags in the file to log them
  const colorRegex = /<color [^>]*\/>/g;
  const matches = content.match(colorRegex);
  if (matches) {
    console.log('Original color tags found:', matches);
  } else {
    console.log('No color tags found initially.');
  }

  // Replace any backgroundColor color tag with a legacy grayscale white color
  const bgRegex = /<color key="backgroundColor" [^>]*\/>/g;
  if (content.match(bgRegex)) {
    content = content.replace(bgRegex, '<color key="backgroundColor" white="1" alpha="1" colorSpace="calibratedWhite"/>');
    fs.writeFileSync(storyboardPath, content, 'utf8');
    console.log('Successfully patched backgroundColor to classic calibratedWhite!');
  } else {
    console.log('Could not find backgroundColor tag to patch.');
  }
} else {
  console.error('ERROR: CDVLaunchScreen.storyboard not found under platforms/ios');
  process.exit(1);
}
