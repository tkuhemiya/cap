#!/bin/sh
set -e

if [ -z "$DEEPSEEK_API_KEY" ]; then
	echo "Build with: DEEPSEEK_API_KEY=sk-xxx ./install.sh"
	exit 1
fi

cc -O2 -Wall -o cap cap.c -lcurl -DAPI_KEY="\"$DEEPSEEK_API_KEY\""

if [ -d "$HOME/.local/bin" ]; then
	DEST="$HOME/.local/bin"
elif [ -d "$HOME/bin" ]; then
	DEST="$HOME/bin"
else
	DEST="$HOME/.local/bin"
	mkdir -p "$DEST"
fi

cp cap "$DEST/cap"
chmod +x "$DEST/cap"
echo "Installed $DEST/cap"
echo "Usage: git add . && cap"
