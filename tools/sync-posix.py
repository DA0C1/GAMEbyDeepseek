#!/usr/bin/env python3
"""Linux/macOS counterparts to the Windows sync launchers. No third-party packages."""

import argparse
import contextlib
import datetime
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time


DEFAULT_REPOSITORY = Path(__file__).resolve().parent.parent
RUNTIME_NAME = ".game-sync"
PATHS = ["--", ".", ":(exclude).game-sync"]
GIT_STATES = ("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer")


class SyncError(Exception):
    pass


class LockBusy(SyncError):
    pass


@contextlib.contextmanager
def regular_file(path, mode, *, directory_fd=None):
    """Never follow symlinks or truncate a hard-linked/special runtime file."""
    flags = os.O_RDONLY if mode == "r" else os.O_WRONLY | os.O_CREAT
    if mode == "a":
        flags |= os.O_APPEND
    flags |= os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK
    descriptor = os.open(path, flags, 0o600, dir_fd=directory_fd)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise SyncError("运行文件必须是普通文件，不能是符号链接、硬链接或设备。")
        if mode == "w":
            os.ftruncate(descriptor, 0)
        with os.fdopen(descriptor, mode, encoding="utf-8", closefd=False) as handle:
            yield handle
    finally:
        os.close(descriptor)


@contextlib.contextmanager
def runtime_directory(repository, create=False):
    path = repository / RUNTIME_NAME
    if create:
        path.mkdir(mode=0o700, exist_ok=True)
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        yield descriptor
    finally:
        os.close(descriptor)


def check_runtime_entry(directory_fd, name):
    try:
        info = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    except FileNotFoundError:
        return False
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise SyncError(f"运行文件 {name} 不是独立普通文件；请先检查，未跟随或改写该路径。")
    return True


def timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def git(repository, *arguments):
    environment = dict(os.environ, GIT_TERMINAL_PROMPT="0", GCM_INTERACTIVE="never", GIT_MERGE_AUTOEDIT="no")
    result = subprocess.run(["git", "-C", str(repository), *arguments], capture_output=True, env=environment)
    if result.returncode:
        detail = (result.stderr or result.stdout).decode("utf-8", errors="replace").strip()
        raise SyncError(f"Git {arguments[0]} 未完成：{detail}")
    return result.stdout


def repository_root(value):
    repository = Path(value).resolve()
    actual = Path(os.fsdecode(git(repository, "rev-parse", "--show-toplevel")).strip()).resolve()
    if actual != repository:
        raise SyncError("请指定游戏仓库根目录，不要指定其中的子目录。")
    return repository


def git_directory(repository):
    return Path(os.fsdecode(git(repository, "rev-parse", "--absolute-git-dir")).strip())


def blocked(repository):
    directory = git_directory(repository)
    return any((directory / name).exists() for name in GIT_STATES) or bool(
        git(repository, "diff", "--name-only", "--diff-filter=U"))


def check_branch(repository):
    if git(repository, "symbolic-ref", "--quiet", "--short", "HEAD").strip() != b"main":
        raise SyncError("当前不在 main 分支，请先切回 main 再同步。")


@contextlib.contextmanager
def exclusive_lock(path, *, directory_fd=None, create=True):
    # Keep the inode in place. Removing it could let two processes lock different files.
    with regular_file(path, "a" if create else "r", directory_fd=directory_fd) as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise LockBusy("另一个同步进程正在运行，请等它完成后再试。") from error
        try:
            yield handle
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def changes(repository):
    return git(repository, "status", "--porcelain=v1", "-z", *PATHS)


def verified_main(repository, expected=None):
    check_branch(repository)
    if blocked(repository):
        raise SyncError("有未解决的冲突或尚未完成的 Git 操作，请先处理并完成合并。")
    # A pathspec on git add cannot remove an already staged private runtime file.
    if git(repository, "ls-files", "-z", "--", RUNTIME_NAME):
        raise SyncError(".game-sync 运行文件已被跟踪或暂存；请先移出 Git 索引，未提交或上传。")
    head = git(repository, "rev-parse", "HEAD").strip()
    main = git(repository, "rev-parse", "refs/heads/main").strip()
    check_branch(repository)
    if head != main or (expected is not None and head != expected):
        raise SyncError("同步期间分支或提交发生变化，已停止；请检查本地状态后重试。")
    return head


def synchronize(repository, message=None, emit=print):
    with exclusive_lock(git_directory(repository) / "game-sync-posix.lock"):
        before = verified_main(repository)
        emit("正在检查远端更新……")
        git(repository, "fetch", "--no-tags", "origin", "refs/heads/main:refs/remotes/origin/main")
        verified_main(repository, before)
        remote_before = git(repository, "rev-parse", "refs/remotes/origin/main").strip().decode()
        if changes(repository):
            emit("正在保存本地修改……")
            verified_main(repository, before)
            git(repository, "add", "-A", *PATHS)
            verified_main(repository, before)
            git(repository, "commit", "-m", message or f"sync: update game {timestamp()}")
            committed = verified_main(repository)
            parent = git(repository, "rev-parse", committed.decode() + "^").strip()
            if parent != before:
                raise SyncError("提交期间 main 被其他 Git 操作改变，已保留本地提交并停止上传。")
        else:
            emit("本地没有新的文件修改。")
            committed = before
        emit("正在合并远端更新……")
        verified_main(repository, committed)
        git(repository, "merge", "--no-edit", remote_before)
        local = verified_main(repository)
        git(repository, "merge-base", "--is-ancestor", committed.decode(), local.decode())
        git(repository, "merge-base", "--is-ancestor", remote_before, local.decode())
        emit("正在上传到远端……")
        verified_main(repository, local)
        # Push the inspected immutable main commit, never an incidental HEAD.
        # User Git configuration must not expand this into tag/submodule uploads.
        git(repository, "push", "--no-follow-tags", "--recurse-submodules=no", "origin",
            local.decode() + ":refs/heads/main")
        remote = git(repository, "ls-remote", "--exit-code", "origin", "refs/heads/main").split()[0]
        if local != remote:
            raise SyncError("远端状态发生变化，请再次运行同步。")
        verified_main(repository, local)
        if changes(repository):
            raise SyncError("已提交的内容已同步，但同步期间又出现了新修改，请再次运行。")
        emit(f"同步完成：本地与远端一致（{local.decode()[:7]}）。")


def runtime_paths(repository):
    runtime = repository / RUNTIME_NAME
    return runtime, runtime / "posix-daemon.lock", runtime / "posix-stop"


def running(repository):
    try:
        with runtime_directory(repository) as directory_fd:
            if not check_runtime_entry(directory_fd, "posix-daemon.lock"):
                return False
            try:
                with exclusive_lock("posix-daemon.lock", directory_fd=directory_fd, create=False):
                    return False
            except LockBusy:
                return True
    except FileNotFoundError:
        return False


def read_state(repository):
    try:
        with runtime_directory(repository) as directory_fd:
            with regular_file("posix-state.json", "r", directory_fd=directory_fd) as handle:
                state = json.load(handle)
        if not isinstance(state, dict):
            return {}
        # A truncated or manually edited state must never crash the read-only UI.
        return {key: value for key, value in state.items() if isinstance(value, str)}
    except (FileNotFoundError, ValueError):
        return {}


def publish(repository, state):
    with runtime_directory(repository) as directory_fd:
        check_runtime_entry(directory_fd, "posix-state.json")
        name = f".posix-state-{os.getpid()}-{time.monotonic_ns()}.tmp"
        descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                             0o600, dir_fd=directory_fd)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(json.dumps(state, ensure_ascii=False, indent=2) + "\n")
            os.replace(name, "posix-state.json", src_dir_fd=directory_fd, dst_dir_fd=directory_fd)
        finally:
            try:
                os.unlink(name, dir_fd=directory_fd)
            except FileNotFoundError:
                pass


def log(repository, message):
    with runtime_directory(repository) as directory_fd:
        target = "posix-sync.log"
        if check_runtime_entry(directory_fd, target) and os.stat(target, dir_fd=directory_fd).st_size > 1024 * 1024:
            check_runtime_entry(directory_fd, "posix-sync.previous.log")
            os.replace(target, "posix-sync.previous.log", src_dir_fd=directory_fd, dst_dir_fd=directory_fd)
        with regular_file(target, "a", directory_fd=directory_fd) as handle:
            handle.write(f"[{timestamp()}] {message}\n")


def fingerprint(repository):
    """Watch tracked/unignored files, including repeated edits with unchanged Git status."""
    digest = hashlib.sha256(changes(repository))
    for name in git(repository, "ls-files", "--cached", "--others", "--exclude-standard", "-z", *PATHS).split(b"\0"):
        if not name:
            continue
        digest.update(name)
        try:
            stat = (repository / os.fsdecode(name)).lstat()
            digest.update(str((stat.st_mtime_ns, stat.st_ctime_ns, stat.st_size, stat.st_mode)).encode())
        except FileNotFoundError:
            digest.update(b"missing")
    return digest.digest()


def run_daemon(repository, interval, debounce):
    check_branch(repository)
    git(repository, "remote", "get-url", "origin")
    runtime, lock, stop = runtime_paths(repository)
    with runtime_directory(repository, create=True) as directory_fd, exclusive_lock("posix-daemon.lock", directory_fd=directory_fd):
        check_runtime_entry(directory_fd, "posix-stop")
        try:
            os.unlink("posix-stop", dir_fd=directory_fd)
        except FileNotFoundError:
            pass
        stopping = False

        def request_stop(_signum, _frame):
            nonlocal stopping
            stopping = True

        signal.signal(signal.SIGTERM, request_stop)
        signal.signal(signal.SIGINT, request_stop)
        state = dict(pid=os.getpid(), repository=str(repository), status="starting", busy=False,
                     intervalSeconds=interval, debounceSeconds=debounce,
                     lastCheckAt=None, lastSuccessAt=None, lastError=None)
        publish(repository, state)
        log(repository, "自动同步已启动。")
        previous = None
        changed_at = time.monotonic()
        next_remote = 0
        dirty = True
        try:
            while not stopping:
                # Refuse a replaced/symlinked runtime directory instead of writing
                # state or logs through its new destination.
                with runtime_directory(repository) as current_fd:
                    if os.fstat(current_fd).st_ino != os.fstat(directory_fd).st_ino or os.fstat(current_fd).st_dev != os.fstat(directory_fd).st_dev:
                        raise SyncError("运行目录在同步期间被替换，已停止。")
                    if check_runtime_entry(current_fd, "posix-stop"):
                        break
                now = time.monotonic()
                current = fingerprint(repository)
                if current != previous:
                    previous, changed_at, dirty = current, now, True
                if dirty and now - changed_at < debounce:
                    time.sleep(0.2)
                    continue
                if not dirty and now < next_remote:
                    time.sleep(0.2)
                    continue
                if blocked(repository):
                    state.update(status="blocked", busy=False, lastError="请解决冲突并完成合并；随后自动恢复。")
                else:
                    state.update(status="syncing", busy=True, lastCheckAt=timestamp())
                    publish(repository, state)
                    try:
                        synchronize(repository, emit=lambda message: log(repository, message))
                        state.update(status="idle", lastSuccessAt=timestamp(), lastError=None)
                    except (SyncError, OSError) as error:
                        state.update(status="blocked" if blocked(repository) else "retrying", lastError=str(error))
                        log(repository, str(error))
                    finally:
                        state["busy"] = False
                # Changes made during synchronization must go through the debounce again.
                after = fingerprint(repository)
                dirty = after != current and bool(changes(repository))
                previous = after
                changed_at = time.monotonic()
                next_remote = changed_at + interval
                publish(repository, state)
                time.sleep(0.2)
        finally:
            state.update(status="stopped", busy=False)
            publish(repository, state)
            try:
                os.unlink("posix-stop", dir_fd=directory_fd)
            except FileNotFoundError:
                pass
            log(repository, "自动同步已停止。")


def start_daemon(repository, interval, debounce):
    if running(repository):
        print("自动同步已在运行，无需重复启动。")
        return
    check_branch(repository)
    git(repository, "remote", "get-url", "origin")
    runtime, _, _ = runtime_paths(repository)
    with runtime_directory(repository, create=True) as directory_fd, regular_file("posix-launcher.log", "a", directory_fd=directory_fd) as output:
        child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "run", "--repository", str(repository),
                                  "--interval", str(interval), "--debounce", str(debounce)],
                                 cwd=repository, stdin=subprocess.DEVNULL, stdout=output, stderr=output,
                                 start_new_session=True, close_fds=True)
    for _ in range(50):
        if running(repository):
            print(f"自动同步已启动：修改停稳 {debounce:g} 秒后上传，每 {interval:g} 秒检查远端。")
            print("未设置开机或登录启动；停止请运行“停止自动同步.sh”。")
            return
        if child.poll() is not None:
            raise SyncError("后台进程未能启动，请查看 .game-sync/posix-launcher.log。")
        time.sleep(0.1)
    raise SyncError("尚未确认后台进程启动；请查看同步状态和 .game-sync/posix-launcher.log，不要反复启动。")


def stop_daemon(repository):
    if not running(repository):
        print("自动同步未在运行。")
        return
    _, _, stop = runtime_paths(repository)
    with runtime_directory(repository) as directory_fd, regular_file("posix-stop", "w", directory_fd=directory_fd) as handle:
        handle.write("stop\n")
    for _ in range(150):
        if not running(repository):
            print("自动同步已停止。")
            return
        time.sleep(0.1)
    print("已请求停止，正在等待本次同步完成；可用“查看同步状态.sh”确认。")


def show_status(repository):
    state = read_state(repository)
    active = running(repository)
    print("山海残卷 · Linux/macOS 自动同步状态")
    print(f"工作目录：{repository}")
    labels = {"starting": "正在启动", "syncing": "正在同步", "idle": "后台运行中", "blocked": "等待解决冲突",
              "retrying": "暂时失败，稍后重试", "stopped": "已停止"}
    print("当前状态：" + (labels.get(state.get("status"), "进程运行中") if active else "未在运行"))
    print("最近检查：" + (state.get("lastCheckAt") or "尚未检查"))
    print("最近成功：" + (state.get("lastSuccessAt") or "尚未完成"))
    if state.get("lastError"):
        print("最近提示：" + state["lastError"])
    print("日志：.game-sync/posix-sync.log")


def seconds(value):
    number = float(value)
    if not math.isfinite(number) or number < 0.2:
        raise argparse.ArgumentTypeError("时间必须是不小于 0.2 的有限秒数")
    return number


def main():
    parser = argparse.ArgumentParser(description="Linux/macOS 游戏同步工具。sync/start/run 会提交、合并并推送 main。")
    parser.add_argument("action", choices=("sync", "start", "stop", "status", "run"))
    parser.add_argument("--repository", type=Path, default=DEFAULT_REPOSITORY)
    parser.add_argument("--message", help="单次同步的提交说明")
    parser.add_argument("--interval", type=seconds, default=30, help="自动检查远端的间隔秒数，默认 30")
    parser.add_argument("--debounce", type=seconds, default=5, help="修改停稳等待秒数，默认 5")
    args = parser.parse_args()
    try:
        repository = repository_root(args.repository)
        if args.action == "sync":
            synchronize(repository, args.message)
        elif args.action == "start":
            start_daemon(repository, args.interval, args.debounce)
        elif args.action == "run":
            run_daemon(repository, args.interval, args.debounce)
        elif args.action == "stop":
            stop_daemon(repository)
        else:
            show_status(repository)
    except (SyncError, OSError) as error:
        print(f"操作已停止：{error}", file=sys.stderr)
        print("本地文件和提交均已保留。冲突须先解决并完成合并；网络失败可重试。", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
