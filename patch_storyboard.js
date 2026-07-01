const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getPngDimensions(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(8);
  fs.readSync(fd, buffer, 0, 8, 16); // Read 8 bytes starting at offset 16 (width and height in IHDR chunk)
  fs.closeSync(fd);
  const width = buffer.readInt32BE(0);
  const height = buffer.readInt32BE(4);
  return { width, height };
}

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

function patchLaunchImages(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file === 'LaunchImage.launchimage') {
        console.log(`Found legacy LaunchImage asset folder at: ${fullPath}`);
        const imgFiles = fs.readdirSync(fullPath);
        for (let j = 0; j < imgFiles.length; j++) {
          const imgFile = imgFiles[j];
          if (imgFile.toLowerCase().endsWith('.png')) {
            const imgPath = path.join(fullPath, imgFile);
            try {
              const { width, height } = getPngDimensions(imgPath);
              console.log(`Original dimensions of ${imgFile}: ${width}x${height}`);
              
              if (process.platform === 'darwin') {
                const sourceIcon = path.resolve(__dirname, 'BVicon.png');
                execSync(`sips -z ${height} ${width} "${sourceIcon}" --out "${imgPath}"`);
                console.log(`Successfully generated custom launch image for ${imgFile}`);
              } else {
                console.log(`Not on macOS. Skipping sips resizing for ${imgFile}`);
              }
            } catch (e) {
              console.error(`Failed to resize launch image ${imgFile}:`, e.message);
            }
          }
        }
      } else {
        patchLaunchImages(fullPath);
      }
    }
  }
}

// Clear all legacy launch images of the robot logo and replace with custom BVicon.png
patchLaunchImages(iosDir);

const storyboardPath = findStoryboard(iosDir);

if (storyboardPath && fs.existsSync(storyboardPath)) {
  console.log(`Found CDVLaunchScreen.storyboard at: ${storyboardPath}. Patching for iOS 9 compatibility...`);
  let content = fs.readFileSync(storyboardPath, 'utf8');
  
  // Find all color tags in the file to log them
  const colorRegex = /<color [^>]*\/>/g;
  const matches = content.match(colorRegex);
  if (matches) {
    console.log('Original color tags found:', matches);
  }

  // Replace any backgroundColor color tag with a legacy grayscale white color
  const bgRegex = /<color key="backgroundColor" [^>]*\/>/g;
  if (content.match(bgRegex)) {
    content = content.replace(bgRegex, '<color key="backgroundColor" white="1" alpha="1" colorSpace="calibratedWhite"/>');
  }

  // Strip out the Cordova robot imageView tag
  content = content.replace(/<imageView[^>]*image="LaunchStoryboard"[^>]*>[\s\S]*?<\/imageView>/g, '');

  // Strip out constraints that reference the removed imageView ID (2ns-9I-Qjs)
  content = content.replace(/<constraint[^>]*2ns-9I-Qjs[^>]*\/>/g, '');

  // Write changes back to storyboard file
  fs.writeFileSync(storyboardPath, content, 'utf8');
  console.log('Successfully patched storyboard to remove the Cordova robot logo and background constraints!');
} else {
  console.error('ERROR: CDVLaunchScreen.storyboard not found under platforms/ios');
  process.exit(1);
}
