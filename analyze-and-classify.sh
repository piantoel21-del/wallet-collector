#!/bin/bash
# analyze-and-classify.sh — Run analyze first, then classify with fresh data
set -e
DIR="/home/ubuntu/meridian/wallet-collector"
cd "$DIR"

echo ""
echo "  ╔════════════════════════════════════════════════════╗"
echo "  ║    🔄  ANALYZE → CLASSIFY PIPELINE               ║"
echo "  ╚════════════════════════════════════════════════════╝"
echo ""

echo "  [1/2] Running analyze.js..."
timeout 600 node analyze.js
ANALYZE_EXIT=$?

if [ $ANALYZE_EXIT -eq 0 ]; then
    echo ""
    echo "  ✅ Analyze selesai. Running classify..."
    echo ""
    node classify.js
    echo ""
    echo "  ✅ Pipeline complete at $(date '+%H:%M:%S')"
else
    echo ""
    echo "  ⚠️  Analyze gagal (exit=$ANALYZE_EXIT), skip classify"
fi

# Touch flag file for monitoring
date -Iseconds > /tmp/wallet-collector-last-run.txt
