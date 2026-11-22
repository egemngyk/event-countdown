#!/usr/bin/env bash
# Cinnamon desklet install script
set -euo pipefail

UUID="event-countdown@egemngyk"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$UUID"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/cinnamon/desklets/$UUID"
CFG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/cinnamon/spices/$UUID"

if [[ "${1:-}" == "--uninstall" ]]; then
    rm -rf "$DEST"
    echo "Removed: $DEST"
    exit 0
fi

[[ -f "$SRC/metadata.json" ]] || { echo "Error: $SRC/metadata.json not found" >&2; exit 1; }

# Install files
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -r "$SRC" "$DEST"
echo "Installed: $DEST"

if [[ "${1:-}" == "--reset-settings" ]]; then
    rm -f "$CFG_DIR"/*.json
    echo "Settings cache cleared."
fi

# Reload desklet in Cinnamon
if command -v gdbus > /dev/null 2>&1; then
    gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon \
        --method org.Cinnamon.ReloadXlet "$UUID" "DESKLET" > /dev/null 2>&1 || true
    echo "Reloaded in Cinnamon."
fi
