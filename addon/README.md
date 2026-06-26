# E-Hentai Helper Firefox Add-on

Development-only Firefox extension for E-Hentai viewer pages.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on...`.
3. Select `addon/manifest.json`.
4. Open an E-Hentai viewer page.
5. Use the toolbar popup to change preload and image fit settings.

Temporary add-ons are removed when Firefox restarts. Use the signing flow below
for normal daily use.

## Install Permanently On Your PCs

Firefox Stable requires installed extensions to be signed. For a private helper
extension, use AMO's unlisted signing flow:

1. Create or sign in to a Mozilla Add-ons developer account.
2. Submit this extension as an unlisted add-on.
3. Download the signed `.xpi` file from AMO.
4. Copy that `.xpi` to your other PCs.
5. Open the `.xpi` in Firefox, or drag it into Firefox, and approve install.

Unlisted signing does not publish the add-on in the public listing.

The manifest declares `data_collection_permissions.required: ["none"]` because
this extension does not collect or transmit user data.

## Versioning

The extension version is stored in both `addon/manifest.json` and
`package.json`.

Manual version bump:

```bash
npm run version:patch
```

GitHub Actions also bumps the patch version automatically after a push to
`main` or `master`. The workflow creates a follow-up commit with
`[skip version]`, so pull after pushing before building the next signed package.

```bash
git push
git pull
npm run addon:build
```

If this is a new repository:

```bash
git init
git add .
git commit -m "Initial E-Hentai Helper add-on"
git branch -M main
git remote add origin <your-repository-url>
git push -u origin main
```

For the automatic version bump workflow, enable write access for GitHub Actions:

1. Open the repository settings on GitHub.
2. Go to `Actions` -> `General`.
3. Under `Workflow permissions`, select `Read and write permissions`.

### Build Submission Package

From the repository root:

```bash
npm install
npm run addon:build
```

Or without installing dependencies first:

```bash
npx web-ext build --source-dir addon --artifacts-dir dist
```

Upload the generated zip from `dist/` to AMO as an unlisted add-on.

### Sign From The CLI

After creating AMO API credentials:

```bash
npx web-ext sign --source-dir addon --artifacts-dir dist --channel unlisted --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
```

The signed `.xpi` is written under `dist/`.

### Development Reload

During development, keep using `about:debugging` and reload the temporary add-on
after file changes. Use the signed `.xpi` only when you want persistent install.

## Features

- Auto-scroll the main image to the top.
- Fit image by viewport height, viewport width, or original size.
- Preload 0 to 3 pages ahead.
- Show preload status and load timing on the page.
- Toggle browser-window fullscreen from the popup.
