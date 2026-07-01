const fs = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_API = 'https://ci.appveyor.com/api/projects/MrCoderShaurya/BVApp';
const DOWNLOAD_DIR = 'C:\\Users\\ADMIN\\Downloads';

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Request failed with status ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Handle redirect
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download file, status code: ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

async function poll() {
  console.log('Checking AppVeyor build status...');
  try {
    const responseText = await makeRequest(PROJECT_API);
    const data = JSON.parse(responseText);
    
    if (!data.project || !data.project.builds || data.project.builds.length === 0) {
      console.log('No builds found on AppVeyor yet. Please click "New Build" on your AppVeyor project dashboard: https://ci.appveyor.com/project/MrCoderShaurya/bvapp');
      setTimeout(poll, 15000);
      return;
    }

    const latestBuild = data.project.builds[0];
    const status = latestBuild.status;
    const version = latestBuild.version;
    console.log(`Latest Build version: ${version}, Status: ${status.toUpperCase()}`);

    if (status === 'queued' || status === 'running' || status === 'starting') {
      console.log('Build is currently running/queued in the cloud. Waiting 20 seconds...');
      setTimeout(poll, 20000);
    } else if (status === 'success') {
      const jobId = latestBuild.jobs[0].jobId;
      const artifactUrl = `https://ci.appveyor.com/api/buildjobs/${jobId}/artifacts/BVApp-armv7-only.ipa`;
      const destPath = path.join(DOWNLOAD_DIR, 'BVApp-armv7-only.ipa');
      
      console.log(`Build succeeded! Downloading legacy IPA from: ${artifactUrl}`);
      console.log(`Saving to: ${destPath}`);
      
      await downloadFile(artifactUrl, destPath);
      console.log('================================================================');
      console.log('🎉 SUCCESS! BVApp-armv7-only.ipa downloaded to your Downloads folder!');
      console.log('================================================================');
      process.exit(0);
    } else {
      console.log(`Build ended with status: ${status.toUpperCase()}. If it failed, please check logs at: https://ci.appveyor.com/project/MrCoderShaurya/bvapp`);
      setTimeout(poll, 30000);
    }
  } catch (err) {
    console.error('Error during polling:', err.message);
    setTimeout(poll, 15000);
  }
}

poll();
