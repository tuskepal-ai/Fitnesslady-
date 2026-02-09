# AI PR Bridge – Usage

## Commands (issue comments)
- `/ai plan <request>`: only posts a plan
- `/ai pr <request>`: creates a branch + commits allowed changes + opens a PR to main

## Safety (MVP)
Allowed paths:
- `.github/`
- `docs/`

## Required secrets
- OPENAI_API_KEY
- (optional) AI_MODEL
