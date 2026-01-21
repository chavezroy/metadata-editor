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
  ogVideo?: string;
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
    
    // Build siteUrl with priority: env var > AWS Amplify > Vercel > detected > fallback
    let siteUrl: string;
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    } else if (process.env.AWS_BRANCH && process.env.AWS_APP_ID) {
      // AWS Amplify deployment
      const branch = process.env.AWS_BRANCH;
      const appId = process.env.AWS_APP_ID;
      siteUrl = `https://${branch}.${appId}.amplifyapp.com`;
    } else if (process.env.VERCEL_URL) {
      // Vercel deployment
      siteUrl = `https://${process.env.VERCEL_URL}`;
    } else {
      siteUrl = detectedSiteUrl || data.siteUrl;
    }

    // Read existing layout file
    const existingContent = fs.readFileSync(layoutPath, 'utf-8');
    
    // Update the layout.tsx content while preserving structure
    const newLayoutContent = updateLayoutMetadata(existingContent, { ...data, siteUrl }, layoutPath);

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

function updateLayoutMetadata(
  existingContent: string,
  data: MetadataUpdate & { siteUrl: string },
  layoutPath: string
): string {
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

  // Fix CSS import path based on actual file location
  try {
    const projectRoot = process.cwd();
    const layoutDir = path.dirname(layoutPath);

    const localGlobalsPath = path.join(layoutDir, 'globals.css');
    const stylesGlobalsPath = path.join(projectRoot, 'styles', 'globals.css');
    const srcStylesGlobalsPath = path.join(projectRoot, 'src', 'styles', 'globals.css');

    const hasLocalGlobals = fs.existsSync(localGlobalsPath);
    const hasStylesGlobals = fs.existsSync(stylesGlobalsPath) || fs.existsSync(srcStylesGlobalsPath);

    if (hasLocalGlobals && !hasStylesGlobals) {
      // Project keeps globals.css next to layout.tsx (e.g. src/app/globals.css or app/globals.css)
      updated = updated
        .replace(/import\s+['"]\.\.\/styles\/globals\.css['"]/, 'import "./globals.css"')
        .replace(/import\s+['"]\.\/globals\.css['"]/, 'import "./globals.css"');
    } else if (hasStylesGlobals) {
      // Project keeps globals.css under styles/ or src/styles/
      updated = updated
        .replace(/import\s+['"]\.\/globals\.css['"]/, 'import "../styles/globals.css"')
        .replace(/import\s+['"]\.\.\/styles\/globals\.css['"]/, 'import "../styles/globals.css"');
    }
  } catch (cssError) {
    console.error('Failed to normalize globals.css import path:', cssError);
  }

  // Update or create siteUrl constant with AWS Amplify and Vercel support
  const siteUrlRegex = /const\s+siteUrl\s*=[\s\S]*?;/;
  const escapedSiteUrl = data.siteUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const newSiteUrl = `const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || \n  (process.env.AWS_BRANCH && process.env.AWS_APP_ID ? \`https://\${process.env.AWS_BRANCH}.\${process.env.AWS_APP_ID}.amplifyapp.com\` : \n  (process.env.VERCEL_URL ? \`https://\${process.env.VERCEL_URL}\` : '${escapedSiteUrl}'));`;
  
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
  const normalizedOgVideo = data.ogVideo ? normalizePublicPath(data.ogVideo) : undefined;

  // Escape for embedding into TS source (NOT regex escaping)
  const escapedTitle = escapeForSingleQuotedString(data.title);
  const escapedDescription = escapeForSingleQuotedString(data.description);
  const escapedOgImage = escapeForTemplateLiteral(normalizedOgImage);
  const escapedFavicon = escapeForSingleQuotedString(normalizedFavicon);
  const escapedOgVideo = normalizedOgVideo ? escapeForTemplateLiteral(normalizedOgVideo) : undefined;

  // Build videos array if ogVideo exists
  const videosSection = escapedOgVideo ? `    videos: [
      {
        url: \`\${siteUrl}${escapedOgVideo}\`,
        type: 'video/mp4',
      },
    ],` : '';

  const newMetadata = `export const metadata: Metadata = {
  title: '${escapedTitle}',
  description: '${escapedDescription}',
  // Icons are handled automatically by Next.js via app/icon.png
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
    ],${videosSection}
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
    
    // Remove icons from metadata (Next.js 13+ uses app/icon.png automatically)
    // Remove entire icons object if it exists
    updated = updated.replace(/icons:\s*\{[\s\S]*?\},\s*/g, '');
    // Remove individual icon properties
    updated = updated.replace(/icon:\s*['"]([^'"]*)['"],?\s*/g, '');
    updated = updated.replace(/shortcut:\s*['"]([^'"]*)['"],?\s*/g, '');
    updated = updated.replace(/apple:\s*['"]([^'"]*)['"],?\s*/g, '');
    
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
