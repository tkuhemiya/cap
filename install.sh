#!/bin/sh
set -e

if [ -z "$DEEPSEEK_API_KEY" ]; then
	echo "Build with: DEEPSEEK_API_KEY=sk-xxx ./install.sh"
	exit 1
fi

if ! command -v baml >/dev/null 2>&1; then
	curl -fsSL https://pkg.boundaryml.com/install.sh | sh -s
	# shellcheck disable=SC1091
	. "$HOME/.baml/env"
fi

if ! command -v cmake >/dev/null 2>&1; then
	echo "cmake is required"
	exit 1
fi

baml generate --agent-skill-check off

# Shared runtime the C++ SDK dlopens. Name it libbridge_cffi.so next to cap.
arch=$(uname -m)
case "$(uname -s)-$arch" in
	Linux-x86_64) so=libbaml_cffi-x86_64-unknown-linux-gnu.so ;;
	Linux-aarch64) so=libbaml_cffi-aarch64-unknown-linux-gnu.so ;;
	Darwin-arm64) so=libbaml_cffi-aarch64-apple-darwin.dylib ;;
	Darwin-x86_64) so=libbaml_cffi-x86_64-apple-darwin.dylib ;;
	*)
		echo "unsupported platform: $(uname -s) $arch"
		exit 1
		;;
esac
ver=$(baml --version | awk '/toolchain/{print $3}')
mkdir -p build
if [ ! -f build/libbridge_cffi.so ] && [ ! -f build/libbridge_cffi.dylib ]; then
	curl -fsSL -o "build/$so" \
		"https://github.com/BoundaryML/baml/releases/download/baml-language-${ver}/$so"
	case "$so" in
		*.dylib) mv "build/$so" build/libbridge_cffi.dylib ;;
		*) mv "build/$so" build/libbridge_cffi.so ;;
	esac
fi

export CXX="${CXX:-g++}"
cmake -B build -DDEEPSEEK_API_KEY="$DEEPSEEK_API_KEY"
cmake --build build

if [ -d "$HOME/.local/bin" ]; then
	DEST="$HOME/.local/bin"
elif [ -d "$HOME/bin" ]; then
	DEST="$HOME/bin"
else
	DEST="$HOME/.local/bin"
	mkdir -p "$DEST"
fi

cp build/cap "$DEST/cap"
chmod +x "$DEST/cap"
if [ -f build/libbridge_cffi.so ]; then
	cp build/libbridge_cffi.so "$DEST/"
fi
if [ -f build/libbridge_cffi.dylib ]; then
	cp build/libbridge_cffi.dylib "$DEST/"
fi
echo "Installed $DEST/cap"
echo "Usage: git add . && cap"
