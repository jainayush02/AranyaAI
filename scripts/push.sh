#!/bin/bash
MSG="${1:-chore: update}"
git add -A && git commit -m "$MSG" && git push
