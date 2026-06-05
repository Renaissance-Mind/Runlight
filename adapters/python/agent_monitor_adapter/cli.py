"""CLI wrapper for AgentMonitor.

Usage:
    agent-monitor run --agent codex -- <command>
    agent-monitor event --session <id> --type <event_type>
    agent-monitor heartbeat --session <id>
    agent-monitor finish --session <id> --result completed
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

from agent_monitor_adapter.base import AgentMonitorClient


def cmd_run(args: argparse.Namespace) -> int:
    command = [c for c in args.command if c != "--"]
    if not command:
        print("No command specified", file=sys.stderr)
        return 1

    client = AgentMonitorClient(
        agent_type=args.agent,
        adapter_name="cli-wrapper",
    )

    cmd_str = " ".join(command[:3])
    session_id = client.start_session(summary=f"CLI: {cmd_str}")
    print(f"AgentMonitor session: {session_id}")

    client.record_event(
        "command.started",
        summary=f"Running: {cmd_str}",
        payload={"command": command[:5]},
    )

    start_time = time.monotonic()
    try:
        proc = subprocess.run(command, cwd=os.getcwd())
        exit_code = proc.returncode
    except KeyboardInterrupt:
        exit_code = 130
    except FileNotFoundError:
        print(f"Command not found: {command[0]}", file=sys.stderr)
        exit_code = 127

    duration_ms = int((time.monotonic() - start_time) * 1000)

    client.record_event(
        "command.finished",
        severity="info" if exit_code == 0 else "warning",
        summary=f"Exit {exit_code}: {cmd_str}",
        payload={
            "command": command[:5],
            "exit_code": exit_code,
            "duration_ms": duration_ms,
        },
    )

    result = "completed" if exit_code == 0 else "failed"
    client.finish_session(result=result, summary=f"CLI {result}: {cmd_str}")
    return exit_code


def cmd_event(args: argparse.Namespace) -> int:
    client = AgentMonitorClient(adapter_name="cli-manual")
    client.record_event(
        args.type,
        session_id=args.session,
        severity=args.severity,
        summary=args.summary,
    )
    return 0


def cmd_heartbeat(args: argparse.Namespace) -> int:
    client = AgentMonitorClient(adapter_name="cli-manual")
    client.record_event(
        "session.heartbeat",
        session_id=args.session,
        severity="debug",
    )
    return 0


def cmd_finish(args: argparse.Namespace) -> int:
    client = AgentMonitorClient(adapter_name="cli-manual")
    client.finish_session(
        result=args.result,
        summary=args.summary,
        session_id=args.session,
    )
    return 0


def main():
    parser = argparse.ArgumentParser(
        prog="agent-monitor",
        description="AgentMonitor CLI — record agent lifecycle events",
    )
    sub = parser.add_subparsers(dest="subcommand", required=True)

    run_p = sub.add_parser("run", help="Wrap a command and monitor its lifecycle")
    run_p.add_argument("--agent", default="generic", help="Agent type")
    run_p.add_argument("command", nargs=argparse.REMAINDER, help="Command to run")

    event_p = sub.add_parser("event", help="Record a single event")
    event_p.add_argument("--session", required=True)
    event_p.add_argument("--type", required=True)
    event_p.add_argument("--severity", default="info")
    event_p.add_argument("--summary")

    hb_p = sub.add_parser("heartbeat", help="Send a heartbeat")
    hb_p.add_argument("--session", required=True)

    fin_p = sub.add_parser("finish", help="Finish a session")
    fin_p.add_argument("--session", required=True)
    fin_p.add_argument("--result", default="completed", choices=["completed", "failed", "aborted"])
    fin_p.add_argument("--summary")

    args = parser.parse_args()

    handlers = {
        "run": cmd_run,
        "event": cmd_event,
        "heartbeat": cmd_heartbeat,
        "finish": cmd_finish,
    }
    sys.exit(handlers[args.subcommand](args))


if __name__ == "__main__":
    main()
