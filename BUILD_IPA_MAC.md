# Build the legacy iOS IPA on macOS

The app has been patched for older iOS 9.3.5 / 32-bit compatibility. To produce an IPA for Sideloadly on a Mac with Xcode installed:

1. Open Terminal in this project folder.
2. Install dependencies:
   ```bash
   npm install
   npm install -g cordova
   ```
3. Add the iOS platform if needed:
   ```bash
   cordova platform add ios
   ```
4. Build the release app:
   ```bash
   cordova build ios --release
   ```
5. Open the Xcode project:
   ```bash
   open platforms/ios/Bhakti\ Vedanta\ App.xcodeproj
   ```
6. In Xcode:
   - Select the target "Bhakti Vedanta App"
   - Go to Signing & Capabilities
   - Choose your Apple Developer team and provisioning profile
   - Set the bundle identifier to something you own
7. Product > Archive
8. Once archived, click Distribute App > Ad Hoc / Development
9. Export the .ipa and upload it with Sideloadly

If you want, I can also help you adjust the bundle identifier and signing settings once you are on a Mac.
