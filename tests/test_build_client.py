"""Tests for the per-client build script.

The vite build itself is stubbed — these cover the parts that decide whether a
client gets a correct bundle and a correct embed snippet.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import build_client as bc  # noqa: E402


@pytest.fixture
def repo(tmp_path, monkeypatch):
    """A throwaway repo layout so tests never touch the real clients/ or builds/."""
    (tmp_path / "clients").mkdir()
    (tmp_path / "builds").mkdir()
    monkeypatch.setattr(bc, "ROOT", tmp_path)
    monkeypatch.setattr(bc, "CLIENTS", tmp_path / "clients")
    monkeypatch.setattr(bc, "BUILDS", tmp_path / "builds")
    return tmp_path


def write_config(repo, name, **overrides):
    config = {
        "client": name,
        "tagName": "voicedots-ai",
        "embed": {
            "title": "Test AI Team",
            "pipeline": "gemini",
            "agentId": "voicedots_agent_test123",
        },
    }
    config.update(overrides)
    (repo / "clients" / f"{name}.json").write_text(json.dumps(config))
    return config


def fake_vite(out_dir):
    """Stand-in for the real build: writes a bundle where vite would."""
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "voicedots-widget.js").write_text("console.log('bundle');")


# ── config loading ───────────────────────────────────────────────────────────

def test_loads_valid_config(repo):
    write_config(repo, "acme")
    assert bc.load_config("acme")["client"] == "acme"


def test_missing_config_lists_known_clients(repo):
    write_config(repo, "acme")
    with pytest.raises(bc.BuildError, match="acme"):
        bc.load_config("ghost")


def test_rejects_client_name_mismatch(repo):
    write_config(repo, "acme", client="somethingelse")
    with pytest.raises(bc.BuildError, match="expected 'acme'"):
        bc.load_config("acme")


@pytest.mark.parametrize("bad", ["../etc", "Acme", "has space", "", "a/b"])
def test_rejects_unsafe_names(repo, bad):
    with pytest.raises(bc.BuildError, match="invalid client name"):
        bc.load_config(bad)


def test_rejects_placeholder_agent_id(repo):
    write_config(repo, "acme", embed={
        "title": "T", "pipeline": "gemini", "agentId": "voicedots_agent_REPLACE_ME"})
    with pytest.raises(bc.BuildError, match="placeholder"):
        bc.load_config("acme")


def test_rejects_missing_required_embed_field(repo):
    write_config(repo, "acme", embed={"title": "T", "pipeline": "gemini"})
    with pytest.raises(bc.BuildError, match="agentId is required"):
        bc.load_config("acme")


def test_rejects_malformed_json(repo):
    (repo / "clients" / "acme.json").write_text("{not json")
    with pytest.raises(bc.BuildError, match="not valid JSON"):
        bc.load_config("acme")


# ── embed snippet ────────────────────────────────────────────────────────────

def test_snippet_points_at_main_not_a_version_tag(repo):
    config = write_config(repo, "acme")
    snippet = bc.embed_snippet(config)
    assert "@main/builds/acme/widget.js" in snippet
    assert "@v" not in snippet, "a pinned version tag can never be updated later"


def test_snippet_uses_custom_tag_name(repo):
    config = write_config(repo, "acme", tagName="acme-ai")
    snippet = bc.embed_snippet(config)
    assert snippet.startswith("<acme-ai config=")
    assert "</acme-ai>" in snippet


def test_snippet_escapes_single_quotes_in_config(repo):
    config = write_config(repo, "acme", embed={
        "title": "O'Brien College", "pipeline": "gemini", "agentId": "voicedots_agent_x"})
    snippet = bc.embed_snippet(config)
    assert "O&#39;Brien" in snippet
    # An unescaped quote would close the attribute and break their page.
    assert "O'Brien" not in snippet


# ── build ────────────────────────────────────────────────────────────────────

def test_build_writes_bundle_and_snippet(repo):
    write_config(repo, "acme")
    bundle = bc.build("acme", runner=fake_vite)
    assert bundle == repo / "builds" / "acme" / "widget.js"
    assert bundle.read_text() == "console.log('bundle');"
    assert "acme" in (bundle.parent / "embed.html").read_text()


def test_build_fails_when_no_bundle_produced(repo):
    write_config(repo, "acme")
    with pytest.raises(bc.BuildError, match="no bundle"):
        bc.build("acme", runner=lambda out: out.mkdir(parents=True, exist_ok=True))


def test_build_leaves_no_staging_directory(repo):
    write_config(repo, "acme")
    bc.build("acme", runner=fake_vite)
    assert not (repo / ".build-tmp" / "acme").exists()


def test_rebuild_overwrites_previous_bundle(repo):
    write_config(repo, "acme")
    bc.build("acme", runner=fake_vite)

    def newer(out_dir):
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "voicedots-widget.js").write_text("console.log('v2');")

    bundle = bc.build("acme", runner=newer)
    assert bundle.read_text() == "console.log('v2');"


def test_one_client_build_does_not_touch_another(repo):
    write_config(repo, "acme")
    write_config(repo, "other")
    bc.build("other", runner=fake_vite)
    bc.build("acme", runner=lambda out: (
        out.mkdir(parents=True, exist_ok=True),
        (out / "voicedots-widget.js").write_text("acme only"),
    ))
    assert (repo / "builds" / "other" / "widget.js").read_text() == "console.log('bundle');"


# ── cli ──────────────────────────────────────────────────────────────────────

def test_cli_reports_unknown_client(repo, capsys):
    assert bc.main(["ghost"]) == 1
    assert "error:" in capsys.readouterr().err
