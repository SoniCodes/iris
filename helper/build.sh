#!/bin/sh
# Builds axhelper. Output is gitignored; run this after checkout.
set -e
cd "$(dirname "$0")"
swiftc -O -o axhelper axhelper.swift \
  -framework AppKit \
  -framework ApplicationServices
echo "built $(pwd)/axhelper"
