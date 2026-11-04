#!/usr/bin/env python3
"""Regression checks using temporary local Git remotes only; never contacts GitHub."""

import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "tools" / "sync-posix.py"
ENVIRONMENT = dict(os.environ, GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_SYSTEM=os.devnull,
                   GIT_TERMINAL_PROMPT="0", GCM_INTERACTIVE="never")


class SyncChecks(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="shanhai-posix-sync-")
        self.root = Path(self.temporary.name)
        self.origin = self.root / "origin.git"
        self.peer = self.root / "peer"
        self.local = self.root / "中文 local game"
        self.daemon = None
        self.daemon_output = None
        self.git("init", "--bare", "--initial-branch=main", str(self.origin), cwd=self.root)
        self.git("init", "--initial-branch=main", str(self.peer), cwd=self.root)
        self.configure(self.peer)
        (self.peer / ".gitignore").write_text("dist/\nnode_modules/\n", encoding="utf-8")
        (self.peer / "game.txt").write_text("initial\n", encoding="utf-8")
        (self.peer / "remove.txt").write_text("obsolete\n", encoding="utf-8")
        self.git("add", "-A", cwd=self.peer)
        self.git("commit", "-m", "fixture: initial", cwd=self.peer)
        self.git("remote", "add", "origin", str(self.origin), cwd=self.peer)
        self.git("push", "-u", "origin", "main", cwd=self.peer)
        self.git("clone", str(self.origin), str(self.local), cwd=self.root)
        self.configure(self.local)

    def tearDown(self):
        try:
            if self.daemon and self.daemon.poll() is None:
                (self.local / ".game-sync" / "posix-stop").write_text("stop")
                try:
                    self.daemon.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    self.daemon.terminate()
                    self.daemon.wait(timeout=10)
            # Covers the detached launcher tested below, even after an assertion fails.
            self.invoke("stop")
        finally:
            if self.daemon_output:
                self.daemon_output.close()
            self.temporary.cleanup()

    def git(self, *arguments, cwd=None):
        result = subprocess.run(["git", *arguments], cwd=cwd or self.local,
                                env=ENVIRONMENT, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return result.stdout.strip()

    def configure(self, directory):
        for key, value in (("user.name", "POSIX sync regression"), ("user.email", "sync-test@example.invalid"),
                           ("core.autocrlf", "false"), ("commit.gpgsign", "false")):
            self.git("config", key, value, cwd=directory)

    def invoke(self, action="sync", expected=0, *extra):
        result = subprocess.run([sys.executable, str(SCRIPT), action, "--repository", str(self.local), *extra],
                                cwd=self.root, env=ENVIRONMENT, capture_output=True, text=True, timeout=25)
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return result.stdout + result.stderr

    def publish_peer(self, name, content):
        self.git("pull", "--ff-only", "origin", "main", cwd=self.peer)
        (self.peer / name).write_text(content, encoding="utf-8")
        self.git("add", "-A", cwd=self.peer)
        self.git("commit", "-m", "fixture: remote edit", cwd=self.peer)
        self.git("push", "origin", "main", cwd=self.peer)

    def same_heads(self):
        self.assertEqual(self.git("rev-parse", "HEAD"), self.git("rev-parse", "main", cwd=self.origin))
        self.assertEqual(self.git("status", "--porcelain", "--", ".", ":(exclude).game-sync"), "")

    def state(self):
        try:
            return json.loads((self.local / ".game-sync" / "posix-state.json").read_text())
        except (OSError, ValueError):
            return {}

    def until(self, condition, label, timeout=15):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if condition():
                return
            if self.daemon:
                self.assertIsNone(self.daemon.poll(), f"daemon exited: {self.state()}")
            time.sleep(0.1)
        self.fail(f"Timed out: {label}: {self.state()}")

    def test_branch_switch_during_fetch_aborts_without_publishing_feature(self):
        before = self.git("rev-parse", "HEAD")
        self.git("switch", "-c", "feature")
        (self.local / "private-feature.txt").write_text("not intended for main\n", encoding="utf-8")
        self.git("add", "private-feature.txt")
        self.git("commit", "-m", "fixture: private feature")
        feature = self.git("rev-parse", "HEAD")
        self.git("switch", "main")
        (self.local / "uncommitted.txt").write_text("must remain uncommitted\n", encoding="utf-8")
        entered = self.root / "fetch-entered"
        release = self.root / "fetch-release"
        upload_pack = self.root / "paused-upload-pack.sh"
        upload_pack.write_text(
            "#!/bin/sh\n"
            f'touch "{entered}"\n'
            f'while [ ! -f "{release}" ]; do sleep 0.05; done\n'
            'exec git-upload-pack "$@"\n', encoding="utf-8")
        upload_pack.chmod(0o755)
        self.git("config", "remote.origin.uploadpack", str(upload_pack))
        process = subprocess.Popen(
            [sys.executable, str(SCRIPT), "sync", "--repository", str(self.local)],
            cwd=self.root, env=ENVIRONMENT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            self.until(entered.exists, "fetch enters local upload-pack", timeout=5)
            self.git("switch", "feature")
            release.touch()
            output, error = process.communicate(timeout=15)
            self.assertNotEqual(process.returncode, 0, output + error)
            self.assertEqual(self.git("rev-parse", "main", cwd=self.origin), before)
            self.assertEqual(self.git("rev-parse", "main"), before)
            self.assertEqual(self.git("rev-parse", "feature"), feature)
            self.assertEqual((self.local / "uncommitted.txt").read_text(), "must remain uncommitted\n")
        finally:
            release.touch()
            if process.poll() is None:
                process.terminate()
                process.communicate(timeout=15)

    def test_symlink_runtime_directory_is_refused_without_external_writes(self):
        outside = self.root / "outside-runtime"
        outside.mkdir()
        runtime = self.local / ".game-sync"
        runtime.symlink_to(outside, target_is_directory=True)
        try:
            self.invoke("start", 1, "--interval", "30", "--debounce", "30")
            self.assertEqual(list(outside.iterdir()), [], "must not write through runtime directory symlink")
        finally:
            # Clean up a mistakenly started baseline daemon before removing its runtime alias.
            subprocess.run([sys.executable, str(SCRIPT), "stop", "--repository", str(self.local)],
                           cwd=self.root, env=ENVIRONMENT, capture_output=True, text=True, timeout=25)
            runtime.unlink(missing_ok=True)

    def test_symlink_stop_file_preserves_external_target(self):
        runtime = self.local / ".game-sync"
        runtime.mkdir()
        victim = self.root / "important.txt"
        victim.write_text("preserve these contents\n", encoding="utf-8")
        stop = runtime / "posix-stop"
        stop.symlink_to(victim)
        try:
            # A held lock models a running daemon without starting persistent work.
            with (runtime / "posix-daemon.lock").open("a+") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.invoke("stop", 1)
                self.assertEqual(victim.read_text(), "preserve these contents\n")
        finally:
            stop.unlink(missing_ok=True)

    def test_hardlink_and_fifo_stop_paths_are_refused(self):
        runtime = self.local / ".game-sync"
        runtime.mkdir()
        victim = self.root / "important-stop.txt"
        victim.write_text("preserve hard-linked content\n", encoding="utf-8")
        stop = runtime / "posix-stop"
        with (runtime / "posix-daemon.lock").open("a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            for kind in ("hardlink", "fifo"):
                with self.subTest(kind=kind):
                    if kind == "hardlink":
                        os.link(victim, stop)
                    else:
                        os.mkfifo(stop)
                    try:
                        self.invoke("stop", 1)
                        self.assertEqual(victim.read_text(), "preserve hard-linked content\n")
                    finally:
                        stop.unlink(missing_ok=True)

    def test_runtime_writer_leaf_aliases_and_special_files_are_refused(self):
        runtime = self.local / ".game-sync"
        runtime.mkdir()
        victim = self.root / "important-runtime.txt"
        victim.write_text("preserve external content\n", encoding="utf-8")
        for name in ("posix-launcher.log", "posix-state.json", "posix-sync.log"):
            for kind in ("symlink", "hardlink", "fifo"):
                with self.subTest(name=name, kind=kind):
                    leaf = runtime / name
                    leaf.unlink(missing_ok=True)
                    if kind == "symlink":
                        leaf.symlink_to(victim)
                    elif kind == "hardlink":
                        os.link(victim, leaf)
                    else:
                        os.mkfifo(leaf)
                    try:
                        action = "start" if name == "posix-launcher.log" else "run"
                        self.invoke(action, 1, "--interval", "30", "--debounce", "30")
                        self.assertEqual(victim.read_text(), "preserve external content\n")
                    finally:
                        leaf.unlink(missing_ok=True)

    def test_pre_staged_runtime_is_refused_without_changing_index(self):
        before = self.git("rev-parse", "HEAD")
        runtime = self.local / ".game-sync"
        runtime.mkdir()
        (runtime / "private-state").write_text("must not be published\n", encoding="utf-8")
        self.git("add", "-f", ".game-sync/private-state")
        (self.local / "game.txt").write_text("normal edit\n", encoding="utf-8")
        index_before = self.git("diff", "--cached", "--binary")
        self.invoke("sync", 1)
        self.assertEqual(self.git("diff", "--cached", "--binary"), index_before)
        self.assertEqual(self.git("rev-parse", "HEAD"), before)
        self.assertEqual(self.git("rev-parse", "main", cwd=self.origin), before)
        self.assertEqual((self.local / "game.txt").read_text(), "normal edit\n")

    def test_sync_does_not_follow_annotated_tags(self):
        self.git("config", "push.followTags", "true")
        self.git("tag", "-a", "private-tag", "-m", "fixture: local annotated tag")
        self.invoke("sync")
        self.same_heads()
        self.assertEqual(self.git("tag", cwd=self.origin), "")
        self.assertEqual(self.git("tag"), "private-tag")

    def test_status_tolerates_non_object_json(self):
        runtime = self.local / ".game-sync"
        runtime.mkdir()
        state = runtime / "posix-state.json"
        for content in ("null", "[]", '"unexpected"'):
            with self.subTest(content=content):
                state.write_text(content, encoding="utf-8")
                self.assertIn("未在运行", self.invoke("status"))
                self.assertEqual(state.read_text(), content, "status must not rewrite malformed state")

    def test_sync_round_trip_and_conflict_safety(self):
        initial = self.git("rev-parse", "HEAD")
        self.invoke()
        self.assertEqual(self.git("rev-parse", "HEAD"), initial, "no empty commits")
        (self.local / "卡牌说明.txt").write_text("local edit\n", encoding="utf-8")
        (self.local / "remove.txt").unlink()
        (self.local / "dist").mkdir()
        (self.local / "dist" / "game.html").write_text("ignored")
        (self.local / ".game-sync").mkdir()
        (self.local / ".game-sync" / "private-state").write_text("never commit runtime")
        self.invoke("sync", 0, "--message", "fixture: explicit commit message")
        self.same_heads()
        self.assertEqual(self.git("log", "-1", "--format=%s"), "fixture: explicit commit message")
        self.assertEqual(self.git("show", "main:卡牌说明.txt", cwd=self.origin), "local edit")
        self.assertEqual(self.git("ls-tree", "-r", "--name-only", "main", "--", "remove.txt", "dist", ".game-sync", cwd=self.origin), "")
        self.publish_peer("remote.txt", "remote update\n")
        self.invoke()
        self.same_heads()
        self.assertEqual((self.local / "remote.txt").read_text(), "remote update\n")
        (self.local / "local-only.txt").write_text("local branch\n")
        self.publish_peer("remote-only.txt", "remote branch\n")
        self.invoke()
        self.same_heads()
        self.assertEqual(len(self.git("rev-list", "--parents", "-n", "1", "HEAD").split()), 3)
        (self.local / "game.txt").write_text("local conflict\n")
        self.publish_peer("game.txt", "remote conflict\n")
        remote_head = self.git("rev-parse", "main", cwd=self.origin)
        self.invoke("sync", 1)
        conflict_head = self.git("rev-parse", "HEAD")
        content = (self.local / "game.txt").read_text()
        self.assertIn("local conflict", content)
        self.assertIn("remote conflict", content)
        self.invoke("sync", 1)
        self.assertEqual(self.git("rev-parse", "HEAD"), conflict_head)
        self.assertEqual(self.git("rev-parse", "main", cwd=self.origin), remote_head)
        (self.local / "game.txt").write_text("local conflict\nremote conflict\n")
        self.git("add", "game.txt")
        self.git("commit", "-m", "fixture: resolve conflict")
        self.invoke()
        self.same_heads()

    def test_failed_fetch_keeps_local_edits_and_retries(self):
        before = self.git("rev-parse", "HEAD")
        (self.local / "offline.txt").write_text("keep my edit")
        self.git("remote", "set-url", "origin", str(self.root / "missing.git"))
        self.invoke("sync", 1)
        self.assertEqual(self.git("rev-parse", "HEAD"), before)
        self.assertEqual((self.local / "offline.txt").read_text(), "keep my edit")
        self.git("remote", "set-url", "origin", str(self.origin))
        self.invoke()
        self.same_heads()

    def test_wrong_branch_unfinished_operation_and_lock(self):
        before = self.git("rev-parse", "HEAD")
        (self.local / "uncommitted.txt").write_text("do not commit on wrong branch")
        self.git("switch", "-c", "feature")
        self.assertIn("main", self.invoke("sync", 1))
        self.invoke("start", 1)
        self.git("switch", "main")
        with (self.local / ".git" / "game-sync-posix.lock").open("a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertIn("另一个同步", self.invoke("sync", 1))
        (self.local / ".git" / "CHERRY_PICK_HEAD").write_text(before)
        self.invoke("sync", 1)
        self.assertEqual(self.git("rev-parse", "HEAD"), before)
        self.assertEqual(self.git("rev-parse", "main", cwd=self.origin), before)
        (self.local / ".git" / "CHERRY_PICK_HEAD").unlink()

    def test_status_is_read_only_and_arguments_are_validated(self):
        result = subprocess.run(["sh", str(ROOT / "查看同步状态.sh"), "--repository", str(self.local)],
                                cwd=self.root, env=ENVIRONMENT, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("未在运行", result.stdout)
        self.assertFalse((self.local / ".game-sync").exists())
        self.invoke("start", 2, "--interval", "nan")
        self.invoke("start", 2, "--debounce", "0")
        self.assertFalse((self.local / ".game-sync").exists())

    def test_detached_start_duplicate_and_stop(self):
        self.invoke("start", 0, "--interval", "0.4", "--debounce", "0.3")
        self.until(lambda: self.state().get("status") == "idle", "detached daemon starts")
        pid = self.state()["pid"]
        self.assertIn("无需重复启动", self.invoke("start"))
        self.assertEqual(self.state()["pid"], pid)
        self.assertIn("已停止", self.invoke("stop"))
        self.assertEqual(self.state()["status"], "stopped")
        self.assertIn("未在运行", self.invoke("status"))

    def test_linked_worktree_and_detached_head(self):
        before = self.git("rev-parse", "HEAD")
        self.git("switch", "--detach")
        self.invoke("sync", 1)
        self.assertEqual(self.git("rev-parse", "main", cwd=self.origin), before)
        linked = self.root / "linked 中文 worktree"
        self.git("worktree", "add", str(linked), "main")
        original = self.local
        try:
            self.local = linked
            self.assertTrue((linked / ".git").is_file())
            (linked / "worktree.txt").write_text("linked worktree update\n")
            self.invoke()
            self.same_heads()
        finally:
            self.local = original

    def test_stop_waits_for_active_git_push(self):
        hooks = self.local / ".git" / "fixture-hooks"
        hooks.mkdir()
        hook = hooks / "pre-push"
        hook.write_text("#!/bin/sh\ntouch .git/fixture-push-started\nsleep 2\n")
        hook.chmod(0o755)
        self.git("config", "core.hooksPath", str(hooks))
        (self.local / "waiting.txt").write_text("finish this push before stopping\n")
        self.invoke("start", 0, "--interval", "0.4", "--debounce", "0.3")
        self.until(lambda: (self.local / ".git" / "fixture-push-started").exists(), "push entered hook")
        self.assertEqual(self.state()["status"], "syncing")
        self.invoke("stop")
        self.assertEqual(self.state()["status"], "stopped")
        self.same_heads()
        self.assertEqual(self.git("show", "main:waiting.txt", cwd=self.origin), "finish this push before stopping")

    def test_background_debounce_download_conflict_and_recovery(self):
        self.daemon_output = (self.root / "daemon.log").open("w+")
        self.daemon = subprocess.Popen([sys.executable, str(SCRIPT), "run", "--repository", str(self.local),
                                       "--interval", "0.5", "--debounce", "0.8"],
                                      env=ENVIRONMENT, stdout=self.daemon_output, stderr=self.daemon_output)
        self.until(lambda: self.state().get("status") == "idle", "initial sync")
        before = self.git("rev-parse", "main", cwd=self.origin)
        for value in ("first", "second", "settled"):
            (self.local / "local.txt").write_text(value + "\n")
            time.sleep(0.2)
        self.assertEqual(self.git("rev-parse", "main", cwd=self.origin), before, "waits for settled edits")
        self.until(lambda: self.state().get("status") == "idle" and self.git("rev-parse", "main", cwd=self.origin) != before,
                   "automatic upload")
        self.assertEqual(self.git("show", "main:local.txt", cwd=self.origin), "settled")
        self.publish_peer("remote.txt", "background remote update\n")
        self.until(lambda: (self.local / "remote.txt").exists() and self.state().get("status") == "idle", "automatic download")
        self.invoke("stop")
        self.daemon.wait(timeout=10)
        self.daemon = None
        self.publish_peer("game.txt", "remote conflict\n")
        (self.local / "game.txt").write_text("local conflict\n")
        self.invoke("start", 0, "--interval", "0.4", "--debounce", "0.3")
        self.until(lambda: self.state().get("status") == "blocked", "conflict pause")
        local_head = self.git("rev-parse", "HEAD")
        remote_head = self.git("rev-parse", "main", cwd=self.origin)
        time.sleep(1)
        self.assertEqual(self.git("rev-parse", "HEAD"), local_head)
        self.assertEqual(self.git("rev-parse", "main", cwd=self.origin), remote_head)
        (self.local / "game.txt").write_text("local conflict\nremote conflict\n")
        self.git("add", "game.txt")
        self.git("commit", "-m", "fixture: resolve conflict")
        self.until(lambda: self.state().get("status") == "idle" and self.git("rev-parse", "HEAD") == self.git("rev-parse", "main", cwd=self.origin),
                   "automatic conflict recovery")
        self.invoke("stop")
        self.assertEqual(self.state()["status"], "stopped")
        self.assertEqual(self.git("ls-tree", "-r", "--name-only", "main", "--", ".game-sync", cwd=self.origin), "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
