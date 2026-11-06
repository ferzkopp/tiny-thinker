"""Download the self-hosted model files listed in catalog.json into ./models.

Each model folder gets the files, a LICENSE copy and an ATTRIBUTION.txt.
models/manifest.json is rebuilt from what is complete on disk; the web app reads it
to decide between the self-hosted copy and Hugging Face.

Usage:
    python download_models.py --profile classroom          # all classroom builds, pinned revisions (~7.3 GB)
  python download_models.py --profile classroom --check  # check local files without network or changes
  python download_models.py                              # every build, latest upstream revisions
  python download_models.py --tiers tiny small           # only some tiers
  python download_models.py --engines gguf               # only the wllama (CPU) builds
  python download_models.py --variants f16               # only half-precision WebLLM builds
  python download_models.py --manifest-only              # just rebuild manifest.json
"""
import argparse
import datetime
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HF = "https://huggingface.co"
APACHE_TEXT_URL = "https://www.apache.org/licenses/LICENSE-2.0.txt"
USER_AGENT = "TinyThinker-model-downloader/1.0"
ROOT = os.path.dirname(os.path.abspath(__file__))
COMPLETE_MARKER = ".complete"


def request(url, method="GET"):
    """Opens a URL, retrying up to three times on network errors and rate limits/server errors."""
    req = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            return urllib.request.urlopen(req, timeout=60)
        except urllib.error.HTTPError as err:
            if err.code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(2 ** attempt * 2)
                continue
            raise
        except urllib.error.URLError:
            if attempt < 3:
                time.sleep(2 ** attempt * 2)
                continue
            raise


def get_json(url):
    """Downloads and parses a JSON document."""
    with request(url) as res:
        return json.load(res)


def try_get_bytes(url):
    """Downloads a small file; returns None if it does not exist or is not accessible."""
    try:
        with request(url) as res:
            return res.read()
    except urllib.error.HTTPError as err:
        if err.code in (401, 403, 404):
            return None
        raise


def sha256(path):
    """Returns the SHA-256 hex digest of a file, reading it in 1 MB chunks."""
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def download(url, dest, expected_size=None, expected_sha256=None, force=False, source_revision=None):
    """Downloads url to dest via a .part file, skipping files that already match.

    expected_size / expected_sha256 verify the result; a mismatch deletes the partial file and raises.
    force re-downloads unless dest.revision shows the file already came from source_revision, so an
    interrupted build can reuse the files it completed.
    """
    revision_path = dest + ".revision"
    if force and source_revision and os.path.isfile(revision_path):
        with open(revision_path, encoding="utf-8") as source:
            force = source.read().strip() != source_revision
    if (not force and os.path.exists(dest)
            and (expected_size is None or os.path.getsize(dest) == expected_size)
            and (expected_sha256 is None or sha256(dest) == expected_sha256)):
        print(f"  = {os.path.basename(dest)}")
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    part = dest + ".part"
    with request(url) as res, open(part, "wb") as out:
        total = expected_size or int(res.headers.get("Content-Length") or 0)
        done = 0
        last = 0.0
        while chunk := res.read(1024 * 1024):
            out.write(chunk)
            done += len(chunk)
            now = time.monotonic()
            if total and now - last > 0.5:
                print(f"\r  + {os.path.basename(dest)}: {done / total:6.1%} of {total / 2**20:,.0f} MB", end="", flush=True)
                last = now
    if expected_size is not None and os.path.getsize(part) != expected_size:
        os.remove(part)
        raise RuntimeError(f"Size mismatch for {url}")
    if expected_sha256 is not None and sha256(part) != expected_sha256:
        os.remove(part)
        raise RuntimeError(f"SHA-256 mismatch for {url}; refusing changed library")
    os.replace(part, dest)
    if source_revision:
        with open(revision_path, "w", encoding="utf-8") as target:
            target.write(source_revision)
    print(f"\r  + {os.path.basename(dest)} ({os.path.getsize(dest) / 2**20:,.1f} MB)".ljust(70))


def repo_info(repo, revision=None):
    """Returns (revision, {path: size}) for a Hugging Face model repository.

    Without a revision, the latest commit is used. The file listing follows the API's paging links.
    """
    revision = revision or get_json(f"{HF}/api/models/{repo}")["sha"]
    url = f"{HF}/api/models/{repo}/tree/{revision}?recursive=true&limit=1000"
    files = []
    while url:
        with request(url) as response:
            files.extend(json.load(response))
            links = response.headers.get("Link", "")
        url = next((entry.split(">", 1)[0].strip().lstrip("<")
                    for entry in links.split(",") if 'rel="next"' in entry), None)
    sizes = {entry["path"]: (entry.get("lfs") or {}).get("size", entry.get("size"))
             for entry in files if entry.get("type") == "file"}
    return revision, sizes


def hf_file_url(repo, revision, path):
    """Download URL for one file of a repository at a fixed revision."""
    return f"{HF}/{repo}/resolve/{revision}/{urllib.parse.quote(path)}"


_apache_text = None  # Cached Apache-2.0 text, fetched at most once per run.


def license_text(upstream):
    """Upstream LICENSE if the original repo ships one, else the canonical Apache-2.0 text."""
    global _apache_text
    data = try_get_bytes(f"{HF}/{upstream}/resolve/main/LICENSE")
    if data:
        return data, f"{HF}/{upstream}/blob/main/LICENSE"
    if _apache_text is None:
        _apache_text = try_get_bytes(APACHE_TEXT_URL)
        if not _apache_text:
            raise RuntimeError("Could not download the Apache-2.0 license text")
    return _apache_text, APACHE_TEXT_URL


def write_license_files(folder, tier, family, source_repo, revision, quant, notes):
    """Writes LICENSE (plus NOTICE if upstream has one) and ATTRIBUTION.txt into a model folder."""
    os.makedirs(folder, exist_ok=True)
    text, text_source = license_text(tier["upstream"])
    with open(os.path.join(folder, "LICENSE"), "wb") as f:
        f.write(text)
    notice = try_get_bytes(f"{HF}/{tier['upstream']}/resolve/main/NOTICE")
    if notice:
        with open(os.path.join(folder, "NOTICE"), "wb") as f:
            f.write(notice)
    lines = [
        f"Model:           {tier['label']} Instruct ({quant})",
        f"Original model:  {HF}/{tier['upstream']}",
        f"Copyright:       {family['copyright']}",
        f"License:         {family['licenseName']} ({family['license']}), see LICENSE in this folder",
        f"                 {family['licenseUrl']}",
        f"License text:    {text_source}",
        f"Files from:      {HF}/{source_repo} (revision {revision})",
        f"Changes:         {notes}",
        f"Downloaded:      {datetime.date.today().isoformat()}",
        "",
    ]
    with open(os.path.join(folder, "ATTRIBUTION.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))


def webllm_dir(models_dir, model_id):
    """Folder of a WebLLM build."""
    return os.path.join(models_dir, "webllm", model_id)


def gguf_dir(models_dir, file):
    """Folder of a GGUF build, named after the file without its extension."""
    return os.path.join(models_dir, "gguf", os.path.splitext(file)[0])


def fetch_webllm(models_dir, catalog, tier, family, variant, profile=None):
    """Downloads one WebLLM build (weights, tokenizer, config and compiled library) and marks it complete.

    With a profile, the pinned revision and library fingerprint are used; otherwise the latest revision.
    """
    v = tier["webllm"][variant]
    repo = f"mlc-ai/{v['id']}"
    print(f"WebLLM {v['id']}")
    folder = webllm_dir(models_dir, v["id"])
    marker = os.path.join(folder, COMPLETE_MARKER)
    previous_revision = marker_revision(folder)
    if os.path.exists(marker):
        os.remove(marker)
    revision, files = repo_info(repo, profile["revisions"][repo] if profile else None)
    # WebLLM appends resolve/main/ to model URLs that lack a /resolve/<rev>/ segment, so mirror that layout.
    weights = os.path.join(folder, "resolve", "main")
    for path, size in sorted(files.items()):
        if path == ".gitattributes":
            continue
        download(hf_file_url(repo, revision, path), safe_path(weights, path), size,
                 force=previous_revision != revision, source_revision=revision)
    lib_dest = os.path.join(models_dir, "webllm", "libs", v["lib"])
    expected_hash = profile["librarySha256"][v["lib"]] if profile else None
    download(catalog["webllm"]["libBase"] + v["lib"], lib_dest, expected_sha256=expected_hash)
    write_license_files(folder, tier, family, repo, revision, v["quant"],
                        f"Converted and quantized ({v['quant']}) to MLC format by the MLC LLM project; not modified further.")
    write_libs_attribution(models_dir, catalog)
    write_inventory(folder, {rel(folder, os.path.join(weights, *path.split("/"))): size
                             for path, size in files.items() if path != ".gitattributes"})
    problems = model_problems(folder, variant=v, library=lib_dest, require_marker=False)
    if problems:
        raise RuntimeError("; ".join(problems))
    with open(marker, "w", encoding="utf-8") as f:
        f.write(revision)


def write_libs_attribution(models_dir, catalog):
    """Writes the attribution for the shared compiled WebGPU libraries, once."""
    folder = os.path.join(models_dir, "webllm", "libs")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "ATTRIBUTION.txt")
    if os.path.exists(path):
        return
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(
            "Compiled WebGPU model libraries (*.wasm) built by the MLC LLM project.\n"
            "Source: https://github.com/mlc-ai/binary-mlc-llm-libs\n"
            f"Downloaded from: {catalog['webllm']['libBase']}\n"
            "Project: https://github.com/mlc-ai/mlc-llm (Apache License 2.0)\n"
        )


def fetch_gguf(models_dir, tier, family, profile=None):
    """Downloads one GGUF build (a single file) and marks it complete."""
    g = tier["gguf"]
    print(f"GGUF {g['file']}")
    folder = gguf_dir(models_dir, g["file"])
    marker = os.path.join(folder, COMPLETE_MARKER)
    previous_revision = marker_revision(folder)
    if os.path.exists(marker):
        os.remove(marker)
    revision, files = repo_info(g["repo"], profile["revisions"][g["repo"]] if profile else None)
    if g["file"] not in files:
        raise RuntimeError(f"{g['file']} not found in {g['repo']}")
    download(hf_file_url(g["repo"], revision, g["file"]), os.path.join(folder, g["file"]), files[g["file"]],
             force=previous_revision != revision, source_revision=revision)
    write_license_files(folder, tier, family, g["repo"], revision, g["quant"],
                        f"Converted to GGUF and quantized ({g['quant']}) by the maintainer of {g['repo']}; not modified further.")
    write_inventory(folder, {g["file"]: files[g["file"]]})
    with open(marker, "w", encoding="utf-8") as f:
        f.write(revision)


def rel(models_dir, path):
    """Path relative to models_dir with forward slashes, as used in manifest URLs."""
    return os.path.relpath(path, models_dir).replace(os.sep, "/")


def safe_path(root, relative):
    """Joins a slash-separated path onto root, refusing paths that would escape root."""
    path = os.path.abspath(os.path.join(root, *relative.split("/")))
    if os.path.commonpath([os.path.abspath(root), path]) != os.path.abspath(root):
        raise ValueError(f"Path escapes model folder: {relative}")
    return path


def marker_revision(folder):
    """Revision recorded in a build's .complete marker, or None if the build is not complete."""
    try:
        with open(os.path.join(folder, COMPLETE_MARKER), encoding="utf-8") as source:
            return source.read().strip()
    except FileNotFoundError:
        return None


def write_inventory(folder, files):
    """Records the expected size of every downloaded file, so --check can detect truncated files offline."""
    with open(os.path.join(folder, ".inventory.json"), "w", encoding="utf-8") as target:
        json.dump(files, target, indent=2)


def model_problems(folder, variant=None, library=None, gguf=None, require_marker=True):
    """Lists what is missing or wrong in one build folder; an empty list means the build is usable.

    Pass variant and library for a WebLLM build, or gguf for a GGUF build. Checks license files,
    the completion marker, required files, shard sizes from ndarray-cache.json and the inventory.
    """
    problems = []

    def require(relative, size=None):
        """Records a problem if the file is missing, empty or (when size is given) the wrong size."""
        path = safe_path(folder, relative)
        if not os.path.isfile(path) or os.path.getsize(path) == 0:
            problems.append(f"Missing/empty {path}")
        elif size is not None and os.path.getsize(path) != size:
            problems.append(f"Size mismatch: {path}")

    try:
        if require_marker:
            require(COMPLETE_MARKER)
        for name in ("LICENSE", "ATTRIBUTION.txt"):
            require(name)
        if gguf:
            require(gguf)
        if variant:
            if not library or not os.path.isfile(library) or not os.path.getsize(library):
                problems.append(f"Missing/empty library: {library}")
            prefix = "resolve/main/"
            require(prefix + "mlc-chat-config.json")
            require(prefix + "tokenizer.json")
            with open(safe_path(folder, prefix + "ndarray-cache.json"), encoding="utf-8") as source:
                records = json.load(source)["records"]
            if not records:
                problems.append(f"No model shards in {folder}")
            for record in records:
                require(prefix + record["dataPath"], record["nbytes"])
        inventory = os.path.join(folder, ".inventory.json")
        if os.path.isfile(inventory):
            with open(inventory, encoding="utf-8") as source:
                for name, size in json.load(source).items():
                    require(name, size)
    except (OSError, ValueError, KeyError, TypeError) as err:
        problems.append(f"Invalid model metadata in {folder}: {err}")
    return problems


def check_models(models_dir, catalog, tiers, engines, variants, profile=None):
    """Offline readiness check for the selected builds and the manifest; returns a list of problems.

    With a profile, also compares revisions, GGUF sizes and library fingerprints with the pinned values.
    """
    problems = []
    expected = {"webllm": set(), "gguf": set()}
    for tier_key in tiers:
        tier = catalog["tiers"][tier_key]
        if "webllm" in engines:
            for variant in variants:
                model = tier["webllm"][variant]
                folder = webllm_dir(models_dir, model["id"])
                library = os.path.join(models_dir, "webllm", "libs", model["lib"])
                problems.extend(model_problems(folder, variant=model, library=library))
                expected["webllm"].add(model["id"])
                if profile:
                    if marker_revision(folder) != profile["revisions"][f"mlc-ai/{model['id']}"]:
                        problems.append(f"Revision mismatch: {model['id']}")
                    if os.path.isfile(library) and sha256(library) != profile["librarySha256"][model["lib"]]:
                        problems.append(f"SHA-256 mismatch: {library}")
        if "gguf" in engines:
            model = tier["gguf"]
            folder = gguf_dir(models_dir, model["file"])
            problems.extend(model_problems(folder, gguf=model["file"]))
            expected["gguf"].add(model["file"])
            if profile:
                if marker_revision(folder) != profile["revisions"][model["repo"]]:
                    problems.append(f"Revision mismatch: {model['file']}")
                path = os.path.join(folder, model["file"])
                if os.path.isfile(path) and os.path.getsize(path) != profile["ggufSizes"][model["file"]]:
                    problems.append(f"Size mismatch: {path}")
    try:
        with open(os.path.join(models_dir, "manifest.json"), encoding="utf-8") as source:
            manifest = json.load(source)
        for engine, identifiers in expected.items():
            for identifier in identifiers:
                entry = manifest[engine].get(identifier)
                if not entry:
                    problems.append(f"Manifest is missing {identifier}; run --manifest-only")
                    continue
                for key in ("model", "lib", "path", "licenseFile", "attributionFile"):
                    if key in entry and not os.path.exists(safe_path(models_dir, entry[key])):
                        problems.append(f"Manifest path missing: {entry[key]}")
    except (OSError, ValueError, KeyError, TypeError) as err:
        problems.append(f"Missing/invalid manifest: {err}")
    return problems


def build_manifest(models_dir, catalog):
    """Writes models/manifest.json listing every usable build; the web app serves only those locally."""
    manifest = {"generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "webllm": {}, "gguf": {}}
    for tier_key, tier in catalog["tiers"].items():
        family = catalog["families"][tier["family"]]
        lic = {"license": family["license"], "licenseName": family["licenseName"]}
        for v in tier["webllm"].values():
            folder = webllm_dir(models_dir, v["id"])
            lib = os.path.join(models_dir, "webllm", "libs", v["lib"])
            if not model_problems(folder, variant=v, library=lib):
                manifest["webllm"][v["id"]] = {
                    "tier": tier_key,
                    "model": rel(models_dir, os.path.join(folder, "resolve", "main")) + "/",
                    "lib": rel(models_dir, lib),
                    "licenseFile": rel(models_dir, os.path.join(folder, "LICENSE")),
                    "attributionFile": rel(models_dir, os.path.join(folder, "ATTRIBUTION.txt")),
                    **lic,
                }
        g = tier["gguf"]
        folder = gguf_dir(models_dir, g["file"])
        if not model_problems(folder, gguf=g["file"]):
            manifest["gguf"][g["file"]] = {
                "tier": tier_key,
                "path": rel(models_dir, os.path.join(folder, g["file"])),
                "licenseFile": rel(models_dir, os.path.join(folder, "LICENSE")),
                "attributionFile": rel(models_dir, os.path.join(folder, "ATTRIBUTION.txt")),
                **lic,
            }
    os.makedirs(models_dir, exist_ok=True)
    with open(os.path.join(models_dir, "manifest.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    return manifest


def main():
    """Parses arguments, then checks, downloads or only rebuilds the manifest. Returns the exit code."""
    with open(os.path.join(ROOT, "catalog.json"), encoding="utf-8") as f:
        catalog = json.load(f)
    tiers = list(catalog["tiers"])
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tiers", nargs="+", choices=tiers)
    parser.add_argument("--engines", nargs="+", choices=["webllm", "gguf"])
    parser.add_argument("--variants", nargs="+", choices=["f16", "f32"])
    parser.add_argument("--profile", choices=["classroom"])
    parser.add_argument("--check", action="store_true", help="check local files and manifest without network or changes")
    parser.add_argument("--dest", default=os.path.join(ROOT, "models"), help="models folder (default: ./models)")
    parser.add_argument("--manifest-only", action="store_true")
    args = parser.parse_args()
    models_dir = os.path.abspath(args.dest)
    if args.check and args.manifest_only:
        parser.error("--check cannot be combined with --manifest-only")
    profile = None
    if args.profile:
        if any((args.tiers, args.engines, args.variants)):
            parser.error("--profile cannot be combined with --tiers, --engines or --variants")
        with open(os.path.join(ROOT, "model-downloads.json"), encoding="utf-8") as source:
            profile = json.load(source)[args.profile]
    args.tiers = (profile or {}).get("tiers", args.tiers or tiers)
    args.engines = (profile or {}).get("engines", args.engines or ["webllm", "gguf"])
    args.variants = (profile or {}).get("variants", args.variants or ["f16", "f32"])
    if args.check:
        problems = check_models(models_dir, catalog, args.tiers, args.engines, args.variants, profile)
        for problem in problems:
            print(f"  ! {problem}", file=sys.stderr)
        print("Check failed." if problems else "All selected models and manifest paths are ready.")
        return 1 if problems else 0

    failures = []
    if not args.manifest_only:
        for tier_key in args.tiers:
            tier = catalog["tiers"][tier_key]
            family = catalog["families"][tier["family"]]
            jobs = []
            if "webllm" in args.engines:
                jobs += [lambda v=v: fetch_webllm(models_dir, catalog, tier, family, v, profile) for v in args.variants]
            if "gguf" in args.engines:
                jobs.append(lambda: fetch_gguf(models_dir, tier, family, profile))
            for job in jobs:
                try:
                    job()
                except Exception as err:
                    print(f"\n  ! failed: {err}", file=sys.stderr)
                    failures.append(str(err))

    manifest = build_manifest(models_dir, catalog)
    print(f"\nmanifest.json: {len(manifest['webllm'])} WebLLM and {len(manifest['gguf'])} GGUF builds available in {models_dir}")
    if failures:
        print(f"{len(failures)} download(s) failed; rerun to resume.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
