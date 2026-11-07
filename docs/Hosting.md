# Model Preparation and Server Configuration

[Project overview and quickstart](../README.md) | [Models and browsers](Models.md) | [Deployment](Deployment.md) | [Development](Development.md)

This guide covers model preparation, local preview and web-server configuration. Follow [Deployment](Deployment.md) for the staging, upload and verification workflow; upload lists and exclusions are maintained there.

Run the commands below from the repository root. Preparing assets uses Python 3.8+ with no third-party Python packages. The deployed site needs no server-side Python or application backend.

## Self-hosting the models

```powershell
python tools/download_models.py --profile classroom                 # all fifteen builds, pinned revisions (~7.3 GB)
python tools/download_models.py --profile classroom --check         # readiness check, no changes
python tools/download_models.py                                     # all builds, latest upstream revisions
python tools/download_models.py --tiers tiny small --variants f16   # a subset
python tools/download_models.py --manifest-only                     # rebuild manifest after changing folders
```

Do not combine `--profile` with explicit tier/engine/variant filters. Without a profile, downloads use the latest upstream revisions instead of pinned ones. A fresh clone can be served without preparing every build; missing models load from Hugging Face when selected.

[model-downloads.json](../config/model-downloads.json) records the classroom revisions (SmolLM2 from original attribution records, Qwen2.5 pinned on 2026-10-30, TinyLlama pinned on 2026-11-06), GGUF sizes and SHA-256 fingerprints of compiled libraries. Model URLs use pinned revisions. Library downloads use the catalog URL but reject content that does not match its recorded fingerprint. Legal notices are retrieved upstream and are not byte-for-byte locked.

Completed files are reused when recorded revision and expected size agree. Interrupted builds reuse completed files; an interrupted individual file restarts rather than resuming byte ranges. `.part`, `.revision`, `.inventory.json` and `.complete` are preparation metadata. Missing files, shard-size mismatches and library hash mismatches fail the check. This checks deployment readiness, not cryptographic integrity of every model weight.

```text
models/
  manifest.json                       # available self-hosted builds
  webllm/<model-id>/resolve/main/...  # MLC weights; resolve/main/ is required
  webllm/<model-id>/LICENSE, ATTRIBUTION.txt
  webllm/libs/*.wasm, ATTRIBUTION.txt
  gguf/<name>/<name>.gguf, LICENSE, ATTRIBUTION.txt
```

- Each model has a license and attribution recording its origin, copyright holder, revision and conversion. [licenses.html](../html/licenses.html) links them.
- Builds missing from the manifest fall back to Hugging Face. Chat's setup badge shows the source.
- Generated weights and the manifest are Git-ignored. Model `LICENSE`, `NOTICE` and `ATTRIBUTION.txt` files remain eligible for version control. Committing the generated manifest would make fresh clones advertise absent assets.
- Git ignore rules do not stop OneDrive sync. Prepare elsewhere with `python tools/download_models.py --profile classroom --dest D:\tiny-thinker-models`, then check with the same `--dest` and `--check`. Local preview and the deployment helper still read the repository's `models/` folder; `--dest` does not change browser model URLs or the helper's source. For the complete workflow outside OneDrive, use a non-synced checkout with its prepared assets in `models/`.

### Remote-only models

For a deployment that intentionally loads every model from Hugging Face, use the `--manifest-only` option above in a checkout with no downloaded weights. It creates an empty manifest that can be staged. Do not remove prepared weights or hand-edit the manifest just to make staging succeed.

## Run locally

```powershell
python tools/serve.py             # http://localhost:8000
python tools/serve.py --isolate   # COOP/COEP headers enable multithreaded wllama
```

Opening HTML with `file://` does not work. Use `--port 8001` if the default port is busy.

The preview tool serves source pages from `html/` at the usual root URLs, such as `/index.html` and `/chat.html`, and exposes the files in `web/` at their root URLs. Use this tool for the source checkout; the [deployment snapshot](Deployment.md#included-and-excluded-files) places those files at the upload root for ordinary static hosting.

## Server requirements

1. **HTTPS:** WebGPU and storage APIs require a secure context. Localhost also counts as secure.
2. **MIME types:** `.js`/`.mjs` -> `text/javascript`, `.wasm` -> `application/wasm`, `.json` -> `application/json`. Permit large `.gguf` and `.bin` downloads.
3. **Optional isolation:** add `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` for multithreaded CPU inference. Without them, wllama runs single-threaded. jsDelivr, Hugging Face and raw.githubusercontent.com send CORS headers. Check that setup reports multithreaded WebAssembly after enabling isolation.

The included IIS and Apache configurations set isolation headers, MIME types and a 30-day cache for `.gguf`, `.bin` and `.wasm` model files, and also work in subdirectories. Compression mainly helps `.json`. App assets require revalidation; see [Release version](Development.md#release-version).

### IIS

Configuration is provided by [web.config](../web/web.config), stored in `web/` and copied to the deployment root. It removes and re-adds MIME types to avoid conflicting with IIS defaults. In a subfolder of an IIS application, it merges with the parent configuration.

### Apache

Configuration is provided by [.htaccess](../web/.htaccess), stored in `web/` and copied to the deployment root. The server needs `mod_headers`, `mod_mime` and `AllowOverride FileInfo` or `All`; otherwise Apache ignores it.

### nginx

nginx does not read configuration from the site folder. Add this to its server configuration, adjusting the path:

```nginx
location /tiny-thinker/ {
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cache-Control "no-cache" always;
    # This types block replaces nginx's default list for the location.
    types { text/html html; text/css css; text/javascript js mjs; application/json json; application/wasm wasm; application/octet-stream gguf bin; image/svg+xml svg; text/plain txt; text/markdown md; }
}
location ~* ^/tiny-thinker/models/.*\.(gguf|bin|wasm)$ {
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cache-Control "public, max-age=2592000" always;
}
```

## Search engines

Pages carry description, author, license and Open Graph tags. Setup also includes schema.org `WebApplication` data. The experiment and chat pages are `noindex` because they redirect to setup when no model is selected.

[robots.txt](../web/robots.txt) keeps crawlers out of model weights and tests. The helper copies it from `web/` to the deployment root. Crawlers read it only at the site's origin root: for a subdirectory deployment, copy its rules into the origin-root `robots.txt` with the folder prefix.