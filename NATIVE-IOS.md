# TrailFlip on iOS (native, App Store)

The web app is already installable on iPhone (Safari → Share → **Add to Home Screen**).
This guide is for the **native** App Store build — the only way to get a true
one-tap **Share Extension** (share a screenshot/link straight into TrailFlip) and
native push notifications, which iOS does not allow for web apps.

The repo is **Capacitor-ready** (`capacitor.config.json` + deps in `package.json`).
`server.url` points the native shell at the live site, so your normal
auto-deploys keep the in-app experience up to date with no rebuild.

## What you need (one-time)
- A **Mac** with **Xcode** + Command Line Tools, and **CocoaPods** (`sudo gem install cocoapods`).
- An **Apple Developer account** ($99/yr) to run on a real device and submit.

## Build steps (on the Mac)
```sh
git clone https://github.com/RockyFrago1234/trailflip && cd trailflip
npm install
npm run build              # produces dist/ (used as the fallback webDir)
npx cap add ios            # creates the native ios/ project (Mac only)
npx cap sync ios           # installs pods + syncs config
npx cap open ios           # opens ios/App/App.xcworkspace in Xcode
```
In Xcode: select the **App** target → **Signing & Capabilities** → pick your Team
and set the Bundle Identifier (e.g. `com.yourname.trailflip`; update `appId` in
`capacitor.config.json` to match). Run on a device.

## Add the Share Extension (the native payoff)
A Share Extension is a separate iOS target that receives a shared image/link and
hands it to the app. Two routes:
- **Community plugin** (fastest): add a Capacitor share-extension plugin
  (e.g. `capacitor-share-extension`), follow its Xcode target + App Group setup,
  and forward the shared item to `https://trailflip.vercel.app/?url=<link>` (the
  app already reads `?url`/`?text`) or hand a shared image to the scanner.
- **Manual**: File → New → Target → **Share Extension**; in its handler, read the
  `NSExtensionItem` attachment and open the app via an App Group + custom URL
  scheme. More control, more native Swift.

## Submit
- App Store Connect → new app → upload via Xcode → fill listing → submit for review.
- Note: a pure web wrapper can hit App Review guideline 4.2 (minimum functionality).
  The Share Extension + push are the native value that clears that bar; if review
  pushes back, bundle the web assets locally (drop `server.url`, make API calls
  absolute to `https://trailflip.vercel.app`) so it's not "just a website".
