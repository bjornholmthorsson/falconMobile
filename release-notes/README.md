# Release notes

One file per shipped version. The filename is the marketing version
(`<major>.<minor>.<revision>.txt`), matching `package.json` after the bump.

Both Play Internal testing ("What's new") and TestFlight ("What to Test")
read from this directory. `bundle exec fastlane bump_revision` (and any lane
that calls it — `play_internal`, `tf_internal`, `release`) refuses to run
without a notes file for the upcoming version.

## Workflow

Before deploying:

1. Look at `android/app/build.gradle` → current `versionName`.
   Compute next: bump the third component (e.g. `1.1.41` → `1.1.42`).
2. Create `release-notes/<next-version>.txt` with the changes testers should
   see (~5–8 short bullets). Be concrete — "Fixed crash when..." not "Bug fixes".
3. Run the deploy:
   - `bundle exec fastlane release` for both stores
   - `bundle exec fastlane play_internal` for Android only
   - `bundle exec fastlane tf_internal` for iOS only

The Android changelog file at `fastlane/metadata/android/en-US/changelogs/`
is auto-generated from this notes file during `bump_revision` — don't edit
it directly.

## Format

Plain text. ~500 chars max for Play (it shows the first 500). TestFlight is
more lenient (~4000) but keep it scannable. No markdown.

## Example

```
Time tracking just got bigger views.
- New Day / Week / Month toggle in the Time tab
- Week view shows per-day totals so you can spot gaps fast
- Month view follows your Tempo period (23rd–22nd here)
- Tap once to focus, double-tap to drill into the day
- Plus button works in every view
```
