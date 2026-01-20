#!/bin/bash

# Metadata Editor - GitHub Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/chavezroy/metadata-editor/main/install-from-github.sh | bash

set -e

REPO_URL="https://raw.githubusercontent.com/chavezroy/metadata-editor/main"
TEMP_DIR=$(mktemp -d)

echo "🚀 Installing Metadata Editor from GitHub..."

# Check if we're in a Next.js project
if [ ! -f "package.json" ]; then
    echo "❌ Error: No package.json found. Make sure you're in a Next.js project root."
    exit 1
fi

# Detect project structure
if [ -d "src/app" ]; then
    APP_DIR="src/app"
    COMPONENTS_DIR="src/components"
    STORE_DIR="src/store"
    CSS_FILE="src/app/globals.css"
    echo "📁 Detected src/ directory structure"
else
    APP_DIR="app"
    COMPONENTS_DIR="components"
    STORE_DIR="store"
    CSS_FILE="app/globals.css"
    echo "📁 Detected root directory structure"
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p "$APP_DIR/api/metadata"
mkdir -p "$COMPONENTS_DIR/ui"
mkdir -p "$STORE_DIR"

# Download files
echo "⬇️  Downloading files from GitHub..."

# Download metadata-editor page
curl -fsSL "$REPO_URL/app/metadata-editor/page.tsx" -o "$TEMP_DIR/page.tsx"
mkdir -p "$APP_DIR/metadata-editor"
mv "$TEMP_DIR/page.tsx" "$APP_DIR/metadata-editor/"

# Download API routes
curl -fsSL "$REPO_URL/app/api/metadata/current/route.ts" -o "$TEMP_DIR/current-route.ts"
curl -fsSL "$REPO_URL/app/api/metadata/update/route.ts" -o "$TEMP_DIR/update-route.ts"
curl -fsSL "$REPO_URL/app/api/metadata/upload-image/route.ts" -o "$TEMP_DIR/upload-route.ts"
curl -fsSL "$REPO_URL/app/api/meta/route.ts" -o "$TEMP_DIR/meta-route.ts"

mkdir -p "$APP_DIR/api/metadata/current"
mkdir -p "$APP_DIR/api/metadata/update"
mkdir -p "$APP_DIR/api/metadata/upload-image"
mkdir -p "$APP_DIR/api/meta"

mv "$TEMP_DIR/current-route.ts" "$APP_DIR/api/metadata/current/route.ts"
mv "$TEMP_DIR/update-route.ts" "$APP_DIR/api/metadata/update/route.ts"
mv "$TEMP_DIR/upload-route.ts" "$APP_DIR/api/metadata/upload-image/route.ts"
mv "$TEMP_DIR/meta-route.ts" "$APP_DIR/api/meta/route.ts"

# Download components
curl -fsSL "$REPO_URL/components/ui/NotificationModal.tsx" -o "$TEMP_DIR/NotificationModal.tsx"
mv "$TEMP_DIR/NotificationModal.tsx" "$COMPONENTS_DIR/ui/"

# Download store
curl -fsSL "$REPO_URL/store/useStore.ts" -o "$TEMP_DIR/useStore.ts"
mv "$TEMP_DIR/useStore.ts" "$STORE_DIR/"

# Clean up temp directory
rm -rf "$TEMP_DIR"

# Add CSS variables
echo "🎨 Adding CSS variables..."
if [ -f "$CSS_FILE" ]; then
    if ! grep -q "color-highlight" "$CSS_FILE"; then
        if grep -q ":root {" "$CSS_FILE"; then
            sed -i.bak '/^[[:space:]]*:root[[:space:]]*{/a\
\
    /* Metadata Editor Colors */\
    --color-background: #ffffff;\
    --color-surface: #f9fafb;\
    --color-font: #111827;\
    --color-secondary: #6b7280;\
    --color-highlight: #3b82f6;
' "$CSS_FILE"
            rm -f "$CSS_FILE.bak"
            echo "✅ Added CSS variables to existing :root"
        else
            echo "
@layer base {
  :root {
    /* Metadata Editor Colors */
    --color-background: #ffffff;
    --color-surface: #f9fafb;
    --color-font: #111827;
    --color-secondary: #6b7280;
    --color-highlight: #3b82f6;
  }
}" >> "$CSS_FILE"
            echo "✅ Created :root section with CSS variables"
        fi
    else
        echo "✅ CSS variables already present"
    fi
else
    echo "⚠️  Warning: globals.css not found at $CSS_FILE"
fi

# Install dependencies
echo "📦 Installing dependencies..."
if command -v pnpm &> /dev/null; then
    pnpm add zustand sharp lucide-react
elif command -v yarn &> /dev/null; then
    yarn add zustand sharp lucide-react
else
    npm install zustand sharp lucide-react
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "🎉 Metadata Editor installed successfully!"
echo ""
echo "Next steps:"
echo "1. Start your dev server: npm run dev"
echo "2. Navigate to /metadata-editor in your app"
echo "3. Configure your metadata and upload images"
echo ""
echo "📖 Documentation: https://github.com/chavezroy/metadata-editor"
