@echo off
REM ===================================================================
REM  Update Podium's Music Library  (Windows — just double-click me)
REM
REM  1. Drop your new PDFs into:
REM       Music Compiler Local System\Reorganized Music Library\<Ensemble>\
REM     Name them:  Title - Artist - part.pdf   (parts: vln1 vln2 vla vc)
REM  2. Double-click this file.
REM  3. Review the list of new songs, type Y to make them live.
REM ===================================================================
cd /d "%~dp0"
node "scripts\update-library.js"
echo.
pause
