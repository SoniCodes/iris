#!/bin/sh
# Builds axhelper. Output is gitignored; run this after checkout.
set -e
cd "$(dirname "$0")"
if [ -x axhelper ] && [ axhelper -nt axhelper.swift ]; then
  echo "axhelper up to date"
  exit 0
fi
swiftc -O -o axhelper axhelper.swift \
  -framework AppKit \
  -framework ApplicationServices
echo "built $(pwd)/axhelper"
