#!/usr/bin/env python3
"""End-to-end check of the SolidCraft MCP path used by the assistant preset.

Builds the documented parametric plate, verifies both volumes, writes a render
and a .sc design. Run from the workspace root:

    python3 scripts/verify_mcp.py
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESIGN = os.path.join(ROOT, "designs", "plate.sc")
RENDER = os.path.join(ROOT, "renders", "plate_iso.png")

proc = subprocess.Popen(
    ["solidcraft-cli", "mcp", "--allow-path", ROOT],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL,
    text=True,
    bufsize=1,
)
next_id = 0


def rpc(method, params=None, notify=False):
    global next_id
    message = {"jsonrpc": "2.0", "method": method}
    if params is not None:
        message["params"] = params
    if not notify:
        next_id += 1
        message["id"] = next_id
    proc.stdin.write(json.dumps(message) + "\n")
    proc.stdin.flush()
    if notify:
        return None
    while True:
        line = proc.stdout.readline()
        if not line:
            raise SystemExit("solidcraft-cli mcp exited unexpectedly")
        reply = json.loads(line)
        if reply.get("id") == next_id:
            return reply


def call_tool(name, arguments):
    reply = rpc("tools/call", {"name": name, "arguments": arguments})
    if "error" in reply:
        raise SystemExit(f"{name}: {reply['error']}")
    result = reply["result"]
    blocks = [b for b in result.get("content", []) if b.get("type") == "text"]
    if result.get("isError"):
        raise SystemExit(f"{name} failed: {blocks[0]['text'] if blocks else result}")
    # The first text block is the tool's own JSON; later ones are session notes.
    return json.loads(blocks[0]["text"]) if blocks else {}


try:
    info = rpc(
        "initialize",
        {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "solidcraft-assistant-verify", "version": "1"},
        },
    )["result"]["serverInfo"]
    rpc("notifications/initialized", notify=True)
    print(f"connected: {info['name']} {info['version']}")

    build = [
        {"command": "parameters.add", "params": {"name": "L", "expression": "80 mm"}},
        {"command": "parameters.add", "params": {"name": "W", "expression": "50 mm"}},
        {"command": "parameters.add", "params": {"name": "T", "expression": "6 mm"}},
        {"command": "parameters.add", "params": {"name": "inset", "expression": "8 mm"}},
        {"command": "sketch.create", "params": {"plane": "XY", "name": "PlateSketch"}},
        {
            "command": "sketch.draw.dimensioned",
            "params": {
                "command": "sketch.rectangle.center",
                "params": {"center": [0, 0], "corner": [40, 25]},
                "dimensions": {"width": "L", "height": "W"},
            },
        },
        {"command": "sketch.finish", "params": {}},
        {"command": "solid.extrude", "params": {"distance": "T", "name": "Plate"}},
        {
            "command": "solid.fillet",
            "params": {
                "edges": [[40, 25, 3], [-40, 25, 3], [40, -25, 3], [-40, -25, 3]],
                "radius": 5,
                "name": "Corners",
            },
        },
        {"command": "sketch.create", "params": {"plane": "XY", "name": "HolePts", "offset": "T"}},
        {"command": "sketch.point", "params": {"point": [32, 17]}},
        {
            "command": "sketch.dimension",
            "params": {"entities": ["origin", "p1"], "type": "horizontal", "value": "L/2 - inset"},
        },
        {
            "command": "sketch.dimension",
            "params": {"entities": ["origin", "p1"], "type": "vertical", "value": "W/2 - inset"},
        },
        {"command": "sketch.finish", "params": {}},
        {
            "command": "solid.hole",
            "params": {
                "sketch": "HolePts",
                "diameter": 3.4,
                "type": "counterbore",
                "cb_diameter": 6.5,
                "cb_depth": 3.3,
                "name": "Hole",
            },
        },
        {
            "command": "solid.pattern.rectangular",
            "params": {
                "features": ["Hole"],
                "dir1": [-1, 0, 0],
                "count1": 2,
                "spacing1": "L - 2*inset",
                "dir2": [0, -1, 0],
                "count2": 2,
                "spacing2": "W - 2*inset",
                "name": "Holes",
            },
        },
    ]
    batch = call_tool("batch", {"commands": build, "verbose": False})
    if not batch.get("ok"):
        raise SystemExit(f"build failed: {batch.get('failed')}")

    measured = call_tool("measure", {"summary": True})
    volume = measured["total"]["volume_mm3"]
    assert abs(volume - 23335.2) / 23335.2 < 0.002, volume
    print(f"plate volume: {volume:.1f} mm3 (expected 23335.2)")

    call_tool("execute", {"command": "parameters.change", "params": {"name": "L", "expression": "120 mm"}, "verbose": False})
    grown = call_tool("measure", {"summary": True})["total"]["volume_mm3"]
    assert abs(grown - 35335.2) / 35335.2 < 0.002, grown
    print(f"after L=120: {grown:.1f} mm3 (expected 35335.2)")

    call_tool(
        "screenshot",
        {
            "source": "model",
            "view": "iso",
            "width": 900,
            "height": 600,
            "path": RENDER,
        },
    )
    print(f"render: {RENDER}")

    saved = call_tool("save", {"path": DESIGN})
    print(f"design: {saved['path']} ({saved['bytes']} bytes)")
    print("OK")
finally:
    proc.terminate()
