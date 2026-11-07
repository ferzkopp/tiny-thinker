# Deployment

[Project overview and quickstart](../README.md) | [Preparing models and server configuration](Hosting.md) | [Development](Development.md)

[prepare-deployment.mjs](../tools/prepare-deployment.mjs) copies the uploadable site into a separate local folder. It does not upload files, change the source or delete previous snapshots. Run commands from the repository root with Node.js 22.7+; model preparation also needs Python 3.8+. Neither tool is needed on the deployed server.

## 1. Prepare and check the release

Complete [model preparation and its readiness check](Hosting.md#self-hosting-the-models) for the model set you intend to serve. For remote loading only, follow [Remote-only models](Hosting.md#remote-only-models). Keep the resulting assets and manifest in the repository's `models/` folder.

If you are changing the app release, finish [release version preparation](Development.md#release-version) before staging. The helper validates release references automatically in the next step; there is no separate release-check command to repeat here.

The helper stages the builds advertised in the existing manifest, not every file found under `models/`. Unprepared builds continue to load from Hugging Face.

## 2. Preview the upload list

```powershell
node tools/prepare-deployment.mjs --dry-run
```

This lists the selected files and their total size without creating an output folder. The helper checks release references and required assets, including manifest paths, model licenses and attribution. It rejects symbolic links, missing assets, paths outside `models/` and manifest references to local-only files. These checks do not replace the downloader's readiness check or verify every weight's cryptographic integrity.

## 3. Create the upload folder

```powershell
node tools/prepare-deployment.mjs
```

The command prints a new folder such as `deployment/tiny-thinker-1.3.1-AbCdEf/`. Each run creates a different folder, so old releases and any records added to them are not overwritten or deleted. Copying the full classroom set needs roughly another 7.3 GB of disk space per snapshot.

Regenerate the snapshot after changing the release version or app files. Existing snapshots retain their original asset URLs; upload the newly generated folder's contents, not an earlier release's folder.

The entire `deployment/` directory is excluded by [.gitignore](../.gitignore). Git ignore does not prevent OneDrive or another sync client from uploading it. To keep the output outside a synced repository, choose another output parent:

```powershell
node tools/prepare-deployment.mjs --output-root "$env:LOCALAPPDATA\tiny-thinker-deployment"
```

On macOS or Linux, use a local path such as `node tools/prepare-deployment.mjs --output-root /tmp/tiny-thinker-deployment`. Custom output parents must be outside the source repository; the default `deployment/` is the only supported in-repository output parent.

If copying fails, the incomplete folder is retained and identified in the error. Do not upload that folder. Fix the cause, such as insufficient disk space, and rerun to create a fresh snapshot. Remove old snapshots yourself only after checking that you no longer need their contents.

## Included and excluded files

The helper uses an explicit app-file allowlist plus the model manifest. It includes:

- The four source pages from `html/`, copied to the upload root so page URLs stay unchanged. Runtime files retain their `js/`, `css/`, `images/` and `config/` folders; the project license stays at the root.
- [robots.txt](../web/robots.txt), [.htaccess](../web/.htaccess) and [web.config](../web/web.config), copied from `web/` to the upload root. Each host ignores the other's server configuration.
- Both engine adapters, the WebLLM worker, and the vendored Logo interpreter with its licenses and attribution notes.
- `models/manifest.json`, advertised GGUF weights, advertised WebLLM model directories and compiled libraries, model licenses, attribution and available `NOTICE` files.

It excludes `.git/`, local environments, development scripts, README and guides, tests, screenshots, `node_modules/`, Python caches, unadvertised model builds, unfinished `.part` files and download bookkeeping such as `.revision`, `.complete` and `.inventory.json`. Staging does not delete any of those source files, so no source-tree cleanup is needed. Keep useful screenshots and notes locally. Because bookkeeping is excluded, run downloader checks against the original prepared model folder, not the staged copy.

A Git checkout or `git archive` does not contain ignored model payloads and cannot replace a snapshot of the prepared site.

If a new runtime asset is added to the app, update `DEPLOYMENT_FILES` in the helper as part of that change. Additional model files inside an advertised WebLLM model directory are included automatically, except local-only files. See [Repository layout](Development.md#repository-layout) for source-folder ownership.

## 4. Upload and verify

1. Upload the **contents** of the printed snapshot folder to the desired site directory, preserving relative paths. The site can live at the server root or in a subdirectory such as `/playground/`. Do not upload the snapshot's parent folder or mix it with source-tree files. Ensure your transfer tool includes `.htaccess` on Apache.
2. Apply the [server configuration for your host](Hosting.md#server-requirements). IIS and Apache configuration files are included in the snapshot; nginx configuration is applied separately on the server.
3. Open the deployed setup page and confirm its release label and device checks. Load a prepared model and check that its source is self-hosted.
4. Test a reply, help dialogs, switching experiments and Turtle artist's drawing/editor. Check CPU inference as well as WebGPU where available, and inspect model/software license links.

No Python scripts, Node packages or build step are required on the web server. Engine libraries still load from CDNs, so self-hosted weights do not make this a fully offline distribution. See [Privacy](Privacy.md) for network requests and classroom limits.