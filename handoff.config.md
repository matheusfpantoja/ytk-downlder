---
project_name: YTK DOWNLDER
repo: matheusfpantoja/ytk-downlder
devices: [notebook, desktop]
branches:
  - master
  - fix/ffmpeg-location-pasta
prd:
  path: docs/PRD.md
  versioning: explicit   # v1.0 → v1.1
title_format: "O que foi feito + próximo passo"
handoff:
  prefix: YTK
  dir: docs/handoffs
local_env: python app.py
unversioned_files:
  - .claude/settings.local.json
  - __pycache__/
  - bin/
---
