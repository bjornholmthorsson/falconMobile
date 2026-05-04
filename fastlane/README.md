fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

### bump_revision

```sh
[bundle exec] fastlane bump_revision
```

Bump the patch revision across iOS, Android, and package.json. Idempotent across runs: skips if the changelog file for the current versionCode already exists (meaning a previous bump already produced this version).

### build_aab

```sh
[bundle exec] fastlane build_aab
```

Build the signed release AAB.

### play_internal

```sh
[bundle exec] fastlane play_internal
```

Bump version, build, and push to the Play Internal testing track.

### play_promote

```sh
[bundle exec] fastlane play_promote
```

Promote whatever's currently live on internal up to production.

### play_metadata

```sh
[bundle exec] fastlane play_metadata
```

Push only listing metadata (descriptions, changelogs) without a new AAB.

### build_ipa

```sh
[bundle exec] fastlane build_ipa
```

Build a signed release IPA via fastlane gym.

### tf_internal

```sh
[bundle exec] fastlane tf_internal
```

Bump version, build IPA, push to TestFlight with release notes as 'What to Test'.

### release

```sh
[bundle exec] fastlane release
```

Bump once, then push to BOTH Play Internal testing AND TestFlight.

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
