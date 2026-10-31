#!/usr/bin/env python3
"""Fails on any Medium or High Slither finding that is not in slither-triage.json. Lists accepted ones that vanished.

    slither . --json slither.json; python3 scripts/slither-check.py slither.json
"""
import json
import re
import sys

report = json.load(open(sys.argv[1]))
if not report.get("success"):
    sys.exit(f"Slither did not finish: {report.get('error')}")
accepted = {(a["check"], a["element"]) for a in json.load(open("slither-triage.json"))["accepted"]}

seen = set()
new = []
for r in report["results"].get("detectors", []):
    # The description starts with Contract.function(args) or the contract's name, whichever the finding is about.
    head = re.match(r"([\w.]+)", r["description"]).group(1)
    parts = head.split(".")
    element = ".".join(parts[:2])
    key = (r["check"], element)
    seen.add(key)
    if r["impact"] in ("High", "Medium") and key not in accepted:
        new.append(f"{r['impact']}: {r['description'].splitlines()[0]}")

for check, element in sorted(accepted - seen):
    print(f"note: accepted finding no longer reported: {check} {element}")
if new:
    print("Findings to triage:")
    print("\n".join(new))
    sys.exit(1)
print(f"No new Medium or High findings ({len(report['results'].get('detectors', []))} total, all reviewed).")
