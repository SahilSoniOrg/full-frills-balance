#!/bin/bash

# Target budget: 10KB total for all rules
BUDGET=10240
RULES_DIR=".agent/rules"
AGENTS_FILE="AGENTS.md"

TOTAL_SIZE=0

# Check if rules directory exists
if [ -d "$RULES_DIR" ]; then
    # Use find and awk for a portable way to sum file sizes
    SIZE=$(find "$RULES_DIR" -name "*.md" -print0 | xargs -0 stat -f %z | awk '{s+=$1} END {print s}')
    TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
fi

# Check if AGENTS.md exists
if [ -f "$AGENTS_FILE" ]; then
    SIZE=$(ls -l "$AGENTS_FILE" | awk '{print $5}')
    TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
fi

echo "--- Rule Health Check ---"
echo "Total Rule Size: $TOTAL_SIZE bytes"
echo "Target Budget: $BUDGET bytes"

if [ "$TOTAL_SIZE" -gt "$BUDGET" ]; then
    echo "WARNING: Rule context is over budget! Consider pruning or consolidating."
    exit 1
else
    echo "SUCCESS: Rule context is within budget."
    exit 0
fi
