#!/usr/bin/env python3
"""Monitoring script for wallet-collector.
   Silent (exit 0) when healthy. Prints warning when something is wrong."""

import json, os, time
from urllib.request import urlopen
from datetime import datetime, timezone

API_URL = "http://localhost:3456/health"
FLAG_FILE = "/tmp/wallet-collector-last-run.txt"
MAX_AGE_MIN = 150  # 2h30m max without pipeline run (2h cron + 30m grace)

warnings = []

# 1. Check API health
try:
    resp = urlopen(API_URL, timeout=10)
    health = json.loads(resp.read())
    if health.get("status") != "ok":
        warnings.append(f"API status: {health.get('status')}")
    else:
        uptime = health.get("uptimeHuman", "?")
        total = health.get("wallets", {}).get("total", 0)
        smart = health.get("wallets", {}).get("smart", 0)
        last_analyzed = health.get("lastAnalyzedAt", "never")
        # Check if analyzed recently
        if last_analyzed and last_analyzed != "never":
            analyzed_ts = datetime.fromisoformat(last_analyzed.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - analyzed_ts).total_seconds() / 3600
            if age_hours > 4:
                warnings.append(f"Data stale: last analyzed {age_hours:.1f}h ago")
except Exception as e:
    warnings.append(f"Cannot reach API: {e}")

# 2. Check pipeline flag file
if os.path.exists(FLAG_FILE):
    with open(FLAG_FILE) as f:
        last_run = f.read().strip()
    try:
        run_time = datetime.fromisoformat(last_run)
        age_min = (datetime.now().astimezone() - run_time).total_seconds() / 60
        if age_min > MAX_AGE_MIN:
            warnings.append(f"Pipeline not run for {age_min:.0f}m (max {MAX_AGE_MIN}m)")
    except:
        pass
else:
    warnings.append("Pipeline flag file not found (analysis never ran)")

# 3. Output
if warnings:
    print("WALLET-COLLECTOR MONITORING ALERT")
    print("=" * 40)
    for w in warnings:
        print(f"  ! {w}")
    print(f"\n  Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    exit(1)
else:
    # Healthy — silent exit
    exit(0)
