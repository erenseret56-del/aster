# Releasing

For a normal release, run **Actions → Prepare next release → Run workflow** and
choose a patch, minor, or custom version. It opens a tiny version-bump PR;
merging that PR automatically starts **Release** and assembles a draft from the
exact merge commit. Review and publish the draft when it is ready.

The existing **Actions → Release → Run workflow** button remains available for
reruns and recovery. It
builds macOS (arm64 + x64, signed, notarized, stapled), Windows, and Ubuntu
from a single pinned commit, verifies every artifact the way a user would
receive it, and assembles the canonical draft in
[ASTER releases](https://github.com/asteragent1011-cyber/ASTER/releases).

Tick **publish** to publish and verify the release in the same run. Leave it
unticked to review the draft; when you publish that draft in GitHub's UI, the
**Sync published release** workflow re-downloads every asset and verifies the
updater feeds against the published bytes.

The release commit must have passed CI: the **CI passed on the release commit**
job waits (while the platforms build) for ci.yml's `CI` check on the pinned
commit and stops the release before any draft if it failed, was cancelled or
never ran. For a manual run on a commit without a CI run, run **Actions → CI →
Run workflow** on it first. `ship_without_ci` skips the wait, for emergencies
only.

The workflow refuses to overwrite an already-published version. Manual Release
runs still require `package.json`'s version to be bumped on the selected ref.
A release is rejected if any installer, stable download
name, updater feed, blockmap, size, or digest is absent or inconsistent.

GitHub generates the release body from pull requests since the previous
tag. The docs changelog reads published ASTER releases and caches them for
five minutes.
Configure the optional Vercel hook below to rebuild the docs immediately after
publication; otherwise the live cache or the next normal docs deployment
refreshes it.

## Artifact names and the updater feed

`electron-builder.yml` sets `productName: ASTER`, so the packaged app is
`ASTER.app` on macOS, installs to `/opt/ASTER` from the `.deb`, and every
versioned artifact is named `ASTER-<version>-…`. The workflow adds stable
copies for the README's `/latest/download/` links: `ASTER.dmg`,
`ASTER-intel.dmg`, `ASTER-setup.exe`, `ASTER-amd64.deb` and `ASTER.AppImage`.

`app-update.yml` is baked into every packaged desktop app and points at
`asteragent1011-cyber/ASTER`. In-app updates read `latest-mac.yml`,
`latest.yml` and `latest-linux.yml` from **public** releases there, so updates
only reach users once that repository's releases are publicly readable.

ASTER does not mirror releases into the upstream OpenMausBot release
repositories. Never upload ASTER artifacts or feeds there.

## Why the gates exist

Each verification step in `release.yml` maps to a real incident from the
hand-cut releases (0.1.15–0.1.25): stale build output breaking the code
signature, a bare import killing the packaged server on launch while every
check stayed green, helper paths resolving outside the app after bundling,
stapling silently invalidating every published hash, and a finished release
sitting invisible as a draft. Don't remove a gate without reading the comment
above it.

## Bundled browser gates

Desktop builds also stage a pinned engine and Chromium Headless Shell before
packaging. Pre-signing checks validate complete resources and upstream hashes;
native browser smoke tests and macOS signature checks run on the packaged
output. See [browser packaging](browser-packaging.md) for update ownership,
license provenance and Linux sandbox constraints. Missing browser resources
must fail the build, not ship an installer that downloads them on first use.

## One-time setup: release secrets

Set these in **ASTER → Settings → Secrets and variables → Actions**.

The **Prepare next release** workflow also needs
**Settings → Actions → General → Workflow permissions → Allow GitHub Actions
to create and approve pull requests** enabled. The workflow only creates the
version PR; it never approves or merges it.

### 1. `MAC_CERT_P12_BASE64` + `MAC_CERT_PASSWORD`

The Developer ID Application certificate, exported from the Mac that
currently signs releases:

```sh
# Keychain Access → My Certificates → "Developer ID Application: Milind Soni
# (993D98NH4J)" → right-click → Export… → .p12 with a strong password, then:
base64 -i DeveloperID.p12 | pbcopy   # → MAC_CERT_P12_BASE64
# the export password             → MAC_CERT_PASSWORD
```

### 2. `APPLE_API_KEY_P8_BASE64` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER_ID`

An App Store Connect API key for notarization (better than an app-specific
password for CI — revocable, scoped, no 2FA dance):

1. [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api)
2. Generate a **Team Key** with the **Developer** role
3. Download the `.p8` (one chance only), note the Key ID and Issuer ID

```sh
base64 -i AuthKey_XXXXXXXX.p8 | pbcopy   # → APPLE_API_KEY_P8_BASE64
```

The release itself uses the workflow's scoped `GITHUB_TOKEN`; no personal
access token is needed.

### 3. Optional `DOCS_DEPLOY_HOOK_URL`

In Vercel, open the docs project and create a **Deploy Hook** for its production
branch. Store that private URL as the `DOCS_DEPLOY_HOOK_URL` repository secret.
Publishing a release then requests a fresh docs deployment so the generated
changelog appears immediately. Do not put the hook URL in source control.

### Local fallback

The hand-cut path still works when Actions is down or a release needs
surgery: `pnpm package:mac`, gate with `codesign --verify --deep --strict`,
notarize with the local keychain profile (`xcrun notarytool submit …
--keychain-profile AC_PASSWORD`), staple, re-zip, regenerate blockmaps and
`node scripts/regenerate-mac-feed.mjs`, upload the complete asset set, publish,
and always verify the published bytes against the published feed by
downloading them back.
