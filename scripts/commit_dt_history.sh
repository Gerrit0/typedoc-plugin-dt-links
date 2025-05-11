#!/bin/bash

set -e

if ! git diff --exit-code data/dt_history.txt >/dev/null; then
    echo "DefinitelyTyped has had commits, building new release"
    version=$(npm version patch --git-tag-version=false)

extra=$"\
\n\
## $version ($(date '+%Y-%m-%d'))\n\
\n\
-   Updated to produce stable links to DefinitelyTyped for packages published before $(date '+%Y-%m-%d')\n\
"

    awk $"
        modif {
            printf(\"$extra\")
            modif = 0
        }
        /^# Changelog/ && !modif {
            modif = 1
        }
        {print}
    " CHANGELOG.md > CHANGELOG2.md
    mv CHANGELOG2.md CHANGELOG.md

    git add CHANGELOG.md ./package.json ./pnpm-lock.json ./data/dt_history.txt
    git commit -m "[github-actions] Update DT Commits";
    git push
else
    echo "No updates to DefinitelyTyped"
fi
