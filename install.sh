#!/bin/bash
# Install cap to a bin directory

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔧 Installing cap..."

# Determine install location
if [ -d "$HOME/.local/bin" ]; then
    INSTALL_DIR="$HOME/.local/bin"
elif [ -d "$HOME/bin" ]; then
    INSTALL_DIR="$HOME/bin"
else
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
fi

# Check if install dir is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo -e "${YELLOW}⚠️  $INSTALL_DIR is not in your PATH${NC}"
    echo "   Add this to your shell profile:"
    echo "   export PATH=\"$INSTALL_DIR:\$PATH\""
    echo ""
fi

# Copy binary
if [ ! -f "./cap" ]; then
    echo -e "${RED}❌ Binary not found. Run 'bun run build' first${NC}"
    exit 1
fi

cp ./cap "$INSTALL_DIR/cap"
chmod +x "$INSTALL_DIR/cap"

echo -e "${GREEN}✅ Installed to $INSTALL_DIR/cap${NC}"
echo ""
echo "Usage:"
echo "  cap           # Generate commit for staged changes"
echo ""
echo "To reinstall: bun run install:global"
echo "To uninstall: rm $INSTALL_DIR/cap"
