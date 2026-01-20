#!/bin/bash
# update-metadata-editor.sh
# Updates existing metadata-editor installation with latest changes

set -e

REPO_URL="https://raw.githubusercontent.com/chavezroy/metadata-editor/main"

# Detect project structure
if [ -d "src/app" ]; then
    APP_DIR="src/app"
    echo "📁 Detected src/ directory structure"
else
    APP_DIR="app"
    echo "📁 Detected root directory structure"
fi

# Check if metadata-editor is installed
if [ ! -d "$APP_DIR/metadata-editor" ]; then
    echo "❌ Error: metadata-editor not found. Please install it first."
    echo "   Run: curl -fsSL $REPO_URL/install-from-github.sh | bash"
    exit 1
fi

echo "🔄 Updating Metadata Editor..."

# Add missing CSS module if it doesn't exist
if [ ! -f "$APP_DIR/metadata-editor/metadata-editor.module.css" ]; then
    echo "📥 Adding missing CSS module..."
    curl -fsSL "$REPO_URL/app/metadata-editor/metadata-editor.module.css" \
      -o "$APP_DIR/metadata-editor/metadata-editor.module.css"
    echo "   ✅ Added metadata-editor.module.css"
else
    echo "   ℹ️  CSS module already exists, skipping..."
fi

# Add missing /api/meta route if it doesn't exist
if [ ! -f "$APP_DIR/api/meta/route.ts" ]; then
    echo "📥 Adding missing /api/meta route..."
    mkdir -p "$APP_DIR/api/meta"
    curl -fsSL "$REPO_URL/app/api/meta/route.ts" \
      -o "$APP_DIR/api/meta/route.ts"
    echo "   ✅ Added /api/meta/route.ts"
else
    echo "   ℹ️  /api/meta route already exists, skipping..."
fi

# Update existing files
echo "📥 Updating page.tsx..."
curl -fsSL "$REPO_URL/app/metadata-editor/page.tsx" \
  -o "$APP_DIR/metadata-editor/page.tsx"
echo "   ✅ Updated page.tsx"

echo "📥 Updating API routes..."
curl -fsSL "$REPO_URL/app/api/metadata/current/route.ts" \
  -o "$APP_DIR/api/metadata/current/route.ts"
echo "   ✅ Updated /api/metadata/current/route.ts"

curl -fsSL "$REPO_URL/app/api/metadata/update/route.ts" \
  -o "$APP_DIR/api/metadata/update/route.ts"
echo "   ✅ Updated /api/metadata/update/route.ts"

echo ""
echo "✅ Update complete!"
echo ""
echo "Changes applied:"
echo "  • Added metadata-editor.module.css (fixes build error)"
echo "  • Added /api/meta route (enables External URL checker)"
echo "  • Updated page.tsx (enables Preview/External tabs in production)"
echo "  • Updated /api/metadata/current (removes production restriction)"
echo "  • Updated /api/metadata/update (fixes siteUrl creation)"
echo ""
echo "Next steps:"
echo "  1. Test in development: npm run dev"
echo "  2. Navigate to /metadata-editor"
echo "  3. Verify Preview and External URL tabs work in production"
