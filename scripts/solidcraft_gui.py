#!/usr/bin/env python3
"""Open or drive the SolidCraft desktop window for preview.

    python3 scripts/solidcraft_gui.py status
    python3 scripts/solidcraft_gui.py wait [seconds]
    python3 scripts/solidcraft_gui.py open [design.sc]
    python3 scripts/solidcraft_gui.py screenshot [out.png]
    python3 scripts/solidcraft_gui.py push <design.sc> [--reframe]

`open` launches the GUI (with the design, when given) only when no app is
listening; a running app is never restarted or replaced. `push` saves nothing:
give it a design already saved on disk. If that design is already open, its tab
is closed and reopened on the updated file, so the same tab count shows the new
model (no extra tab). A design not open yet gets one new tab. `--reframe` only
moves the camera in the active tab.

The app must be reachable from this machine (same user, same display session).
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

DATA = Path(
    os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")
) / "solidcraft" / "control"
PORT_FILE = DATA / "current.port"
LOG = Path(__file__).resolve().parent.parent / "renders" / "solidcraft-gui.log"
UNIT = "solidcraft-preview"


def port():
    try:
        return int(PORT_FILE.read_text().strip())
    except (OSError, ValueError):
        return None


def token(p):
    return (DATA / f"{p}.token").read_text().strip()


def request(p, method, params=None, time_out=30.0):
    """One authenticated control-protocol request: one JSON line each way."""
    body = {"id": 1, "method": method, "params": params or {}, "token": token(p)}
    with socket.create_connection(("127.0.0.1", p), timeout=time_out) as sock:
        sock.sendall((json.dumps(body) + "\n").encode())
        sock.settimeout(time_out)
        chunks = b""
        while not chunks.endswith(b"\n"):
            piece = sock.recv(1 << 20)
            if not piece:
                break
            chunks += piece
    reply = json.loads(chunks)
    if not reply.get("ok"):
        raise RuntimeError(reply.get("error", "control request failed"))
    return reply.get("result")


def listening(p):
    if p is None:
        return False
    try:
        request(p, "control.capabilities", time_out=2)
        return True
    except Exception:
        return False


def process_running():
    """Whether any app process exists, even one without a reachable channel."""
    try:
        return subprocess.run(
            ["pgrep", "-x", "solidcraft"], capture_output=True, check=False
        ).returncode == 0
    except OSError:
        return False


def unit_active():
    try:
        result = subprocess.run(
            ["systemctl", "--user", "is-active", UNIT], capture_output=True, text=True, check=False
        )
        return result.stdout.strip() == "active"
    except OSError:
        return False


def status():
    p = port()
    result = {
        "running": False,
        "process": process_running(),
        "unit": unit_active(),
        "port_file": str(PORT_FILE),
    }
    if not listening(p):
        return result
    result.update({"running": True, "port": p})
    try:
        result["design"] = request(p, "document.revision", time_out=3)
        result["documents"] = document_count(p)
    except Exception as error:  # app busy or mid-launch
        result["design_error"] = str(error)
    return result


def wait_until_listening(seconds=30):
    deadline = time.time() + seconds
    while time.time() < deadline:
        p = port()
        if listening(p):
            return p
        time.sleep(0.25)
    return None


def launch(design=None, seconds=30):
    """Start one persistent GUI instance. Returns (port, mode).

    A transient systemd user unit keeps the window alive across shell calls.
    Launching from a plain foreground/background shell lets the sandbox reap it,
    which looks like the window closing and reopening. The Popen fallback is
    only for systems without a user systemd manager.
    """
    command = [shutil.which("solidcraft") or "solidcraft"]
    if design:
        command.append(str(Path(design).expanduser().resolve()))

    if shutil.which("systemd-run"):
        subprocess.run(
            ["systemctl", "--user", "reset-failed", UNIT], capture_output=True, check=False
        )
        unit = [
            "systemd-run",
            "--user",
            "--collect",
            f"--unit={UNIT}",
            "--description=SolidCraft preview",
        ]
        for name in ("DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS"):
            value = os.environ.get(name)
            if value:
                unit.append(f"--setenv={name}={value}")
        unit.extend(command)
        started = subprocess.run(unit, capture_output=True, text=True, check=False)
        if started.returncode == 0:
            return wait_until_listening(seconds), "systemd"

    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("ab") as log:
        subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    return wait_until_listening(seconds), "process"


def document_count(p):
    try:
        return request(p, "ui.inspect", {}, 10).get("documents")
    except Exception:
        return None


def tabs(p):
    return request(p, "ui.documents", {}, 10)


def close_matching_tabs(p, design):
    """Close open tabs for the same design, so the file can be reopened in place.

    Tabs are matched by design name (the tab title), which is the file stem for
    a saved design. A dirty tab is left alone: discarding user edits is refused.
    """
    info = tabs(p)
    names = [str(item.get("name", "")).casefold() for item in info.get("documents", [])]
    wanted = design.stem.casefold()
    matches = [index for index, name in enumerate(names) if name == wanted]
    for index in matches:
        item = info["documents"][index]
        if item.get("dirty"):
            raise RuntimeError(
                f"the open '{design.stem}' tab has unsaved changes; save or close it in SolidCraft first"
            )
    closed = []
    for index in reversed(matches):
        request(p, "ui.documents", {"action": "close", "index": index, "force": True}, 30)
        closed.append(index)
    return sorted(closed)


def push(p, design, view="iso", new_tab=True):
    """Update the design in its existing tab, or open one tab for a new design.

    The control channel has no reload or replace request, so an open tab is
    closed and the saved file is opened again: the tab count stays the same and
    the model shows the current content. `--reframe` keeps the tabs and only
    moves the camera.
    """
    design = Path(design).expanduser().resolve()
    if not design.is_file():
        raise FileNotFoundError(design)
    closed = []
    opened = None
    if new_tab:
        closed = close_matching_tabs(p, design)
        opened = request(
            p, "engine.execute", {"command": "doc.open", "params": {"path": str(design)}}, 120
        )
    framed = request(p, "engine.execute", {"command": "view.apply", "params": {"view": view}}, 30)
    return {
        "design": str(design),
        "opened": opened,
        "closed_tabs": closed,
        "updated": bool(closed),
        "new_tab": bool(new_tab) and not closed,
        "documents": document_count(p),
        "view": framed,
    }


def main(argv):
    action = argv[1] if len(argv) > 1 else "status"
    rest = [arg for arg in argv[2:] if not arg.startswith("--")]
    flags = {arg for arg in argv[2:] if arg.startswith("--")}
    design = rest[0] if rest else None

    if action == "status":
        print(json.dumps(status(), indent=2, ensure_ascii=False))
        return 0

    if action == "open":
        current = status()
        if current.get("running"):
            # Never restart or replace an instance that is already serving.
            result = {"launched": False, **current}
            if design:
                result["push"] = push(current["port"], design)
        elif current.get("process"):
            result = {
                "launched": False,
                "running": False,
                "process": True,
                "error": (
                    "SolidCraft is already running but its control channel is not reachable. "
                    "Do not start a second instance: enable Preferences > Assistant > "
                    "Let AI agents connect, or open the design in the running window by hand."
                ),
            }
        else:
            p, mode = launch(design)
            if p is None:
                result = {
                    "launched": True,
                    "running": False,
                    "mode": mode,
                    "error": "SolidCraft did not open its control channel; see renders/solidcraft-gui.log",
                    "log": str(LOG),
                }
            else:
                result = {"launched": True, "running": True, "mode": mode, "port": p}
                if design:
                    result["design"] = str(Path(design).expanduser().resolve())
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result.get("running") else 1

    if action == "wait":
        seconds = int(os.environ.get("SOLIDCRAFT_WAIT_SECONDS", "30"))
        p = wait_until_listening(seconds)
        print(json.dumps({"running": bool(p), "port": p}, indent=2))
        return 0 if p else 1

    if action == "screenshot":
        current = status()
        if not current.get("running"):
            print(json.dumps({"running": False, "hint": "run `open` first"}, indent=2))
            return 1
        target = Path(design or LOG.parent / "gui_window.png").expanduser().resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        shot = request(current["port"], "ui.screenshot", {"path": str(target)}, 60)
        print(json.dumps({"path": str(target), **shot}, indent=2))
        return 0

    if action == "push":
        if not design:
            print("usage: solidcraft_gui.py push <design.sc>", file=sys.stderr)
            return 2
        current = status()
        if not current.get("running"):
            print(json.dumps({"running": False, "hint": "run `open` first"}, indent=2))
            return 1
        result = push(current["port"], design, new_tab="--reframe" not in flags)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0

    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
