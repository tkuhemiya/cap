#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔧 Installing cap..."

if [ -d "$HOME/.local/bin" ]; then
    INSTALL_DIR="$HOME/.local/bin"
elif [ -d "$HOME/bin" ]; then
    INSTALL_DIR="$HOME/bin"
else
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
fi

if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo -e "${YELLOW}⚠️  $INSTALL_DIR is not in your PATH${NC}"
    echo "   Add this to your shell profile:"
    echo "   export PATH=\"$INSTALL_DIR:\$PATH\""
fi

if [ ! -f "./cap" ]; then
    echo -e "${RED}❌ Binary not found. Build first:${NC}"
    echo "   go build -o cap ."
    echo "   # or: DEEPSEEK_API_KEY=sk-xxx go build -ldflags=\"-X main.apiKey=\$DEEPSEEK_API_KEY\" -o cap ."
    exit 1
fi

cp ./cap "$INSTALL_DIR/cap"
chmod +x "$INSTALL_DIR/cap"

echo -e "${GREEN}✅ Installed to $INSTALL_DIR/cap${NC}"
echo ""
echo "Usage:"
echo "  cap"
echo ""
echo "Set DEEPSEEK_API_KEY unless you baked the key in at build time."
echo "To uninstall: rm $INSTALL_DIR/cap"
