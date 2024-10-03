#!/usr/bin/env bash

# Always run in repo root
cd "$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"/..

mkdir -p tmp

if [ -d tmp/DefinitelyTyped ]; then
    # Avoid re-cloning if we already have a repo
    git -C tmp/DefinitelyTyped fetch
else
    git clone git@github.com:DefinitelyTyped/DefinitelyTyped.git --bare tmp/DefinitelyTyped
fi

git -C tmp/DefinitelyTyped log --pretty=format:"%h %cd" --date=unix > data/dt_history.txt
