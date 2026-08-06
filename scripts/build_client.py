#!/usr/bin/env python3
"""Build one client's widget bundle from the shared source.

    python3 scripts/build_client.py dscet

Reads clients/<name>.json, runs the vite build, and writes the result to
builds/<name>/widget.js together with the exact embed snippet that client
must paste on their site.

Client pages point at builds/<name>/widget.js on the main branch — never a
version tag — so a rebuild reaches them without touching their HTML.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLIENTS = ROOT / "clients"
BUILDS = ROOT / "builds"
CDN = "https://cdn.jsdelivr.net/gh/Voicedots-AI/client-ai-widget-source@main"

NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


class BuildError(Exception):
    """Anything that should stop the build with a readable message."""


def load_config(name: str) -> dict:
    """Read and validate clients/<name>.json."""
    if not NAME_RE.match(name):
        raise BuildError(
            f"invalid client name {name!r}: use lowercase letters, digits, - and _"
        )
    path = CLIENTS / f"{name}.json"
    if not path.exists():
        available = sorted(
            p.stem for p in CLIENTS.glob("*.json") if not p.stem.startswith("_")
        )
        raise BuildError(
            f"no config at {path.relative_to(ROOT)}. "
            f"Known clients: {', '.join(available) or 'none yet'}"
        )
    try:
        config = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise BuildError(f"{path.name} is not valid JSON: {exc}") from exc

    if config.get("client") != name:
        raise BuildError(
            f"{path.name} has client={config.get('client')!r}, expected {name!r}"
        )
    embed = config.get("embed")
    if not isinstance(embed, dict):
        raise BuildError(f"{path.name} is missing an 'embed' object")
    for field in ("agentId", "pipeline", "title"):
        if not embed.get(field):
            raise BuildError(f"{path.name}: embed.{field} is required")
    if "REPLACE_ME" in str(embed["agentId"]):
        raise BuildError(f"{path.name}: embed.agentId is still the placeholder")
    return config


def embed_snippet(config: dict) -> str:
    """The two tags the client pastes into their page.

    The config is pretty-printed and indented so their developer can read and
    edit it. Newlines are legal inside an HTML attribute value.
    """
    tag = config.get("tagName") or "voicedots-ai"
    # Single quotes wrap the attribute, so the JSON must not contain any.
    payload = json.dumps(config["embed"], indent=2).replace("'", "&#39;")
    payload = "\n".join("  " + line for line in payload.splitlines()).lstrip()
    src = f"{CDN}/builds/{config['client']}/widget.js"
    return (
        f"<!-- {config.get('displayName', config['client'])} — Voicedots AI widget -->\n"
        f"<{tag} config='{payload}'></{tag}>\n"
        f'<script type="module" src="{src}"></script>\n'
    )


def run_vite(out_dir: Path) -> None:
    """Produce the bundle. Kept separate so tests can stub it out."""
    subprocess.run(
        ["npm", "run", "build", "--", "--outDir", str(out_dir), "--emptyOutDir"],
        cwd=ROOT,
        check=True,
    )


def build(name: str, *, runner=run_vite) -> Path:
    """Build one client and return the path to their bundle."""
    config = load_config(name)
    out = BUILDS / name
    staging = ROOT / ".build-tmp" / name
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)

    runner(staging)

    produced = staging / "voicedots-widget.js"
    if not produced.exists():
        raise BuildError(f"build produced no bundle at {produced}")

    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(produced, out / "widget.js")
    (out / "embed.html").write_text(embed_snippet(config))
    shutil.rmtree(staging)
    return out / "widget.js"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build one client's widget bundle.")
    parser.add_argument("client", help="client name, matching clients/<name>.json")
    args = parser.parse_args(argv)
    try:
        bundle = build(args.client)
    except BuildError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError:
        print("error: the vite build failed — see output above", file=sys.stderr)
        return 1
    size = bundle.stat().st_size
    print(f"built {bundle.relative_to(ROOT)} ({size:,} bytes)")
    print(f"embed snippet: {bundle.parent.relative_to(ROOT)}/embed.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
