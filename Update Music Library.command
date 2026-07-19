#!/bin/bash
# ===================================================================
#  Update Podium's Music Library  (Mac — just double-click me)
#
#  1. Drop your new PDFs into:
#       Music Compiler Local System/Reorganized Music Library/<Ensemble>/
#     Name them:  Title - Artist - part.pdf   (parts: vln1 vln2 vla vc)
#  2. Double-click this file.
#  3. Review the list of new songs, type Y to make them live.
#
#  First time only: right-click → Open (to get past Gatekeeper), and if it
#  won't run, from Terminal:  chmod +x "Update Music Library.command"
# ===================================================================
cd "$(dirname "$0")" || exit 1
node "scripts/update-library.js"
echo ""
echo "Press any key to close…"
read -n 1 -s
