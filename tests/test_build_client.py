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


def fake_vite(out_dir, forced=None):
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
    assert "<acme-ai config=" in snippet
    assert "</acme-ai>" in snippet
    assert "voicedots-ai" not in snippet


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
        bc.build("acme", runner=lambda out, forced: out.mkdir(parents=True, exist_ok=True))


def test_build_leaves_no_staging_directory(repo):
    write_config(repo, "acme")
    bc.build("acme", runner=fake_vite)
    assert not (repo / ".build-tmp" / "acme").exists()


def test_rebuild_overwrites_previous_bundle(repo):
    write_config(repo, "acme")
    bc.build("acme", runner=fake_vite)

    def newer(out_dir, forced=None):
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "voicedots-widget.js").write_text("console.log('v2');")

    bundle = bc.build("acme", runner=newer)
    assert bundle.read_text() == "console.log('v2');"


def test_one_client_build_does_not_touch_another(repo):
    write_config(repo, "acme")
    write_config(repo, "other")
    bc.build("other", runner=fake_vite)
    bc.build("acme", runner=lambda out, forced: (
        out.mkdir(parents=True, exist_ok=True),
        (out / "voicedots-widget.js").write_text("acme only"),
    ))
    assert (repo / "builds" / "other" / "widget.js").read_text() == "console.log('bundle');"


# ── cli ──────────────────────────────────────────────────────────────────────

def test_cli_reports_unknown_client(repo, capsys):
    assert bc.main(["ghost"]) == 1
    assert "error:" in capsys.readouterr().err


def test_snippet_is_readable_multiline(repo):
    config = write_config(repo, "acme")
    snippet = bc.embed_snippet(config)
    assert snippet.count("\n") > 5, "config should be pretty-printed, not one long line"
    assert snippet.startswith("<!-- "), "should carry a comment naming the client"
    # Still one attribute: the JSON must remain inside a single pair of quotes.
    assert snippet.count("config='") == 1
    assert snippet.count("'></") == 1


# ── forced config ────────────────────────────────────────────────────────────

def test_forced_config_reaches_the_build(repo):
    """A client whose page we cannot edit gets their settings from the bundle."""
    write_config(repo, "acme", forceEmbed={"widgetWidth": "240px", "minimized": True})
    seen = {}

    def runner(out_dir, forced):
        seen.update(forced)
        fake_vite(out_dir)

    bc.build("acme", runner=runner)
    assert seen == {"widgetWidth": "240px", "minimized": True}


def test_build_without_forced_config_passes_nothing(repo):
    write_config(repo, "acme")
    seen = []

    def runner(out_dir, forced):
        seen.append(forced)
        fake_vite(out_dir)

    bc.build("acme", runner=runner)
    assert seen == [{}]


def test_rejects_non_object_forced_config(repo):
    write_config(repo, "acme", forceEmbed=["widgetWidth"])
    with pytest.raises(bc.BuildError, match="forceEmbed"):
        bc.load_config("acme")


def test_forced_config_is_not_pasted_into_the_snippet(repo):
    """It lives in the bundle; repeating it in the snippet would let it drift."""
    config = write_config(repo, "acme", forceEmbed={"widgetWidth": "240px"})
    assert "forceEmbed" not in bc.embed_snippet(config)


def test_run_vite_hands_the_forced_config_to_vite(monkeypatch):
    calls = {}

    def fake_run(cmd, **kwargs):
        calls["cmd"] = cmd
        calls["env"] = kwargs["env"]

    monkeypatch.setattr(bc.subprocess, "run", fake_run)
    bc.run_vite(Path("/tmp/out"), {"minimized": True})
    assert json.loads(calls["env"]["VD_FORCED_CONFIG"]) == {"minimized": True}
    # The rest of the environment must survive, or npm/node break.
    assert "PATH" in calls["env"]


def test_run_vite_without_forced_config_sends_an_empty_object(monkeypatch):
    calls = {}
    monkeypatch.setattr(bc.subprocess, "run", lambda cmd, **kw: calls.update(kw))
    bc.run_vite(Path("/tmp/out"))
    assert calls["env"]["VD_FORCED_CONFIG"] == "{}"


# ── the two clients this behaviour was built for ─────────────────────────────

REAL_CLIENTS = Path(__file__).resolve().parent.parent / "clients"


def real_config(name):
    return json.loads((REAL_CLIENTS / f"{name}.json").read_text())


@pytest.mark.parametrize("name", ["slmch", "mgr"])
def test_reonboarded_clients_keep_the_small_card(name):
    """Both sites ran a 240px card before the migration and want it back."""
    assert real_config(name)["forceEmbed"]["widgetWidth"] == "240px"


def test_slmch_greets_on_desktop_and_stays_folded_on_mobile():
    forced = real_config("slmch")["forceEmbed"]
    assert forced["minimized"] is False
    assert forced["mobileMinimized"] is True
    assert forced["autoCloseSeconds"] == 30


def test_mgr_starts_closed_everywhere():
    forced = real_config("mgr")["forceEmbed"]
    assert forced["minimized"] is True
    assert forced["mobileMinimized"] is True


@pytest.mark.parametrize("name", ["slmch", "mgr", "sona"])
def test_forced_settings_match_the_snippet_we_hand_the_client(name):
    """The snippet is what a new page pastes; it must not contradict the bundle."""
    config = real_config(name)
    for key, value in config["forceEmbed"].items():
        assert config["embed"][key] == value, f"{name}: embed.{key} drifted"
