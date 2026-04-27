#!/bin/sh
# Xcode Cloud automatically invokes this script after cloning the repo
# (and before resolving Swift packages / building). It must install the
# JS and CocoaPods dependencies that aren't checked into the repo so
# that .xcfilelist references and Pods/ exist when xcodebuild runs.
#
# Local builds use `npm install` + `cd ios && pod install` — this script
# does the same on Apple's CI.

set -euo pipefail

# Move to the repo root (the script lives in <repo>/ci_scripts/).
cd "$(dirname "$0")/.."

echo "▸ Installing Node.js via Homebrew (Xcode Cloud images don't ship with Node)"
brew install node

echo "▸ Installing JS dependencies"
npm install --no-audit --no-fund

echo "▸ Installing CocoaPods"
brew install cocoapods

echo "▸ Running pod install"
cd ios
pod install --repo-update
