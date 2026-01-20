import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface MetadataUpdate {
  title: string;
  description: string;
  siteUrl: string;
  ogImage: string;
  ogImageWidth: number;
  ogImageHeight: number;
  favicon: string;
}

export async function POST(request: NextRequest) {
  // Only allow in development mode
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This API is only available in development mode' },
      { status: 403 }
    );
  }

  try {
    const data: MetadataUpdate = await request.json();
    
    // Try src/app first, then fall back to app
    const srcLayoutPath = path.join(process.cwd(), 'src/app', 'layout.tsx');
    const appLayoutPath = path.join(process.cwd(), 'app', 'layout.tsx');
    
    let layoutPath: string;
    if (fs.existsSync(srcLayoutPath)) {
      layoutPath = srcLayoutPath;
    } else if (fs.existsSync(appLayoutPath)) {
      layoutPath = appLayoutPath;
    } else {
      return NextResponse.json(
        { error: 'layout.tsx not found in src/app or app directory' },
        { status: 404 }
      );
    }

    // Detect the actual site URL from the request
    const host = request.headers.get('host') || '';
    const protocol = request.headers.get('x-forwarded-proto') || 
                     (host.includes('localhost') ? 'http' : 'https');
    const detectedSiteUrl = host ? `${protocol}://${host}` : data.siteUrl;
    
    // Use environment variable if available, otherwise use detected URL
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || detectedSiteUrl;

    // Read existing layout file
    const existingContent = fs.readFileSync(layoutPath, 'utf-8');
    
    // Update the layout.tsx content while preserving structure
    const newLayoutContent = updateLayoutMetadata(existingContent, { ...data, siteUrl });

    // Write the updated content back to layout.tsx
    fs.writeFileSync(layoutPath, newLayoutContent, 'utf-8');

    return NextResponse.json({ success: true, message: 'Metadata updated successfully' });
  } catch (error) {
    console.error('Error updating metadata:', error);
    return NextResponse.json(
      { error: 'Failed to update metadata' },
      { status: 500 }
    );
  }
}

function updateLayoutMetadata(existingContent: string, data: MetadataUpdate & { siteUrl: string }): string {
  let updated = existingContent;

  const normalizePublicPath = (value: string): string => {
    const trimmed = value.trim();
    // Undo accidental escaping like "/favicon\.png" or "/og-image\\\.png"
    const unescaped = trimmed.replace(/\\+\./g, '.');
    if (unescaped.startsWith('http://') || unescaped.startsWith('https://')) return unescaped;
    return unescaped.startsWith('/') ? unescaped : `/${unescaped}`;
  };

  const escapeForSingleQuotedString = (value: string): string =>
    value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const escapeForTemplateLiteral = (value: string): string =>
    value.replace(/\\/g, '\\\\').replace(/`/g, '\\`');

  // Fix CSS import path if it's wrong
  updated = updated.replace(
    /import\s+['"]\.\/globals\.css['"]/,
    'import "../styles/globals.css"'
  );

  // Update or create siteUrl constant
  const siteUrlRegex = /const\s+siteUrl\s*=[\s\S]*?;/;
  const escapedSiteUrl = data.siteUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const newSiteUrl = `const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || \n  (process.env.VERCEL_URL ? \`https://\${process.env.VERCEL_URL}\` : '${escapedSiteUrl}');`;
  
  if (siteUrlRegex.test(updated)) {
    // Update existing siteUrl
    updated = updated.replace(siteUrlRegex, newSiteUrl);
  } else {
    // Create siteUrl constant before metadata export if it doesn't exist
    const metadataExportRegex = /(export\s+const\s+metadata)/;
    if (metadataExportRegex.test(updated)) {
      updated = updated.replace(metadataExportRegex, `${newSiteUrl}\n\n$1`);
    } else {
      // If no metadata export found, add at the top after imports
      const importEndRegex = /(import\s+[^;]+;[\s\n]*)+/;
      if (importEndRegex.test(updated)) {
        updated = updated.replace(importEndRegex, `$&${newSiteUrl}\n\n`);
      } else {
        // Last resort: add at the beginning
        updated = `${newSiteUrl}\n\n${updated}`;
      }
    }
  }

  // Update metadata object - handle both single-line and multi-line formats
  // First, try to replace the entire metadata export
  const metadataRegex = /export\s+const\s+metadata:\s*Metadata\s*=\s*\{[\s\S]*?\};/;
  
  const normalizedOgImage = normalizePublicPath(data.ogImage);
  const normalizedFavicon = normalizePublicPath(data.favicon);

  // Escape for embedding into TS source (NOT regex escaping)
  const escapedTitle = escapeForSingleQuotedString(data.title);
  const escapedDescription = escapeForSingleQuotedString(data.description);
  const escapedOgImage = escapeForTemplateLiteral(normalizedOgImage);
  const escapedFavicon = escapeForSingleQuotedString(normalizedFavicon);

  const newMetadata = `export const metadata: Metadata = {
  title: '${escapedTitle}',
  description: '${escapedDescription}',
  icons: {
    icon: '${escapedFavicon}',
    shortcut: '${escapedFavicon}',
    apple: '${escapedFavicon}',
  },
  openGraph: {
    title: '${escapedTitle}',
    description: '${escapedDescription}',
    url: siteUrl,
    siteName: '${escapedTitle}',
    images: [
      {
        url: \`\${siteUrl}${escapedOgImage}\`,
        width: ${data.ogImageWidth},
        height: ${data.ogImageHeight},
        alt: '${escapedTitle}',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '${escapedTitle}',
    description: '${escapedDescription}',
    images: [\`\${siteUrl}${escapedOgImage}\`],
  },
};`;

  // More comprehensive metadata replacement - match the entire metadata object including nested structures
  const fullMetadataRegex = /export\s+const\s+metadata:\s*Metadata\s*=\s*\{[\s\S]*?\n\};/;
  
  if (fullMetadataRegex.test(updated)) {
    updated = updated.replace(fullMetadataRegex, newMetadata);
  } else {
    // If regex doesn't match, try a simpler approach - just replace key fields
    updated = updated.replace(/title:\s*['"]([^'"]*)['"]/g, `title: '${escapedTitle}'`);
    updated = updated.replace(/description:\s*['"]([^'"]*)['"]/g, `description: '${escapedDescription}'`);
    
    // Update icons
    updated = updated.replace(/icon:\s*['"]([^'"]*)['"]/g, `icon: '${escapedFavicon}'`);
    updated = updated.replace(/shortcut:\s*['"]([^'"]*)['"]/g, `shortcut: '${escapedFavicon}'`);
    updated = updated.replace(/apple:\s*['"]([^'"]*)['"]/g, `apple: '${escapedFavicon}'`);
    // Support icons.icon array format: icon: [{ url: "/..." , sizes: "any" }]
    updated = updated.replace(/(icon:\s*\[\s*\{\s*url:\s*)['"][^'"]+['"]/g, `$1'${escapedFavicon}'`);
    
    // Update OG image
    const ogImageRegex = /url:\s*`\$\{siteUrl\}([^`]+)`/g;
    updated = updated.replace(ogImageRegex, `url: \`\${siteUrl}${escapedOgImage}\``);
    updated = updated.replace(/width:\s*(\d+)/g, `width: ${data.ogImageWidth}`);
    updated = updated.replace(/height:\s*(\d+)/g, `height: ${data.ogImageHeight}`);
    
    // Update Twitter images
    const twitterImagesRegex = /images:\s*\[`\$\{siteUrl\}([^`]+)`\]/g;
    updated = updated.replace(twitterImagesRegex, `images: [\`\${siteUrl}${escapedOgImage}\`]`);
  }

  // Remove GoogleAnalytics import and usage if component doesn't exist
  const hasGoogleAnalytics = fs.existsSync(path.join(process.cwd(), 'components', 'GoogleAnalytics.tsx')) ||
                             fs.existsSync(path.join(process.cwd(), 'components', 'GoogleAnalytics.ts'));
  
  if (!hasGoogleAnalytics) {
    // Remove GoogleAnalytics import
    updated = updated.replace(/import\s+GoogleAnalytics\s+from\s+['"]@\/components\/GoogleAnalytics['"];?\n?/g, '');
    // Remove GoogleAnalytics usage from JSX
    updated = updated.replace(/<GoogleAnalytics\s*\/>\n?\s*/g, '');
  }

  return updated;
}
