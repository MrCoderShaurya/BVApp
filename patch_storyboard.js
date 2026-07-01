const fs = require('fs');
const path = require('path');

const storyboardPath = path.join('platforms', 'ios', 'Bhakti Vedanta App', 'CDVLaunchScreen.storyboard');

if (fs.existsSync(storyboardPath)) {
  console.log('Found CDVLaunchScreen.storyboard. Patching for iOS 9 compatibility...');
  let content = fs.readFileSync(storyboardPath, 'utf8');
  
  // Replace the modern calibratedWhite custom color space with legacy calibratedWhite
  const target = 'colorSpace="custom" customColorSpace="calibratedWhite"';
  const replacement = 'colorSpace="calibratedWhite"';
  
  if (content.includes(target)) {
    content = content.split(target).join(replacement);
    fs.writeFileSync(storyboardPath, content, 'utf8');
    console.log('Successfully patched CDVLaunchScreen.storyboard!');
  } else {
    console.log('Storyboard already patched or target pattern not found.');
  }
} else {
  console.error('ERROR: CDVLaunchScreen.storyboard not found at:', storyboardPath);
  process.exit(1);
}
