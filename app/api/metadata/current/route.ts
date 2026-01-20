import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  // Allow in production - this is a read-only operation that reads layout.tsx
  try {
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
    
    const layoutContent = fs.readFileSync(layoutPath, 'utf-8');

    // Extract siteUrl
    const siteUrlMatch = layoutContent.match(/const\s+siteUrl\s*=\s*['"]([^'"]+)['"]/);
    const siteUrl = siteUrlMatch ? siteUrlMatch[1] : 'https://yourdomain.com';

    // Extract title
    const titleMatch = layoutContent.match(/title:\s*['"]([^'"]+)['"]/);
    const title = titleMatch ? titleMatch[1] : 'Start Page';

    // Extract description
    const descMatch = layoutContent.match(/description:\s*['"]([^'"]+)['"]/);
    const description = descMatch ? descMatch[1] : '';

    // Extract OG image URL (from the images array)
    const ogImageMatch = layoutContent.match(/url:\s*`\$\{siteUrl\}([^`]+)`/);
    const ogImageRaw = ogImageMatch ? ogImageMatch[1] : '/og-img.png';
    // Normalize escaped characters (remove backslashes before dots)
    const ogImage = ogImageRaw.replace(/\\+\./g, '.');

    // Extract width
    const widthMatch = layoutContent.match(/width:\s*(\d+)/);
    const ogImageWidth = widthMatch ? parseInt(widthMatch[1]) : 1200;

    // Extract height
    const heightMatch = layoutContent.match(/height:\s*(\d+)/);
    const ogImageHeight = heightMatch ? parseInt(heightMatch[1]) : 630;

    // Extract alt text
    const altMatch = layoutContent.match(/alt:\s*['"]([^'"]+)['"]/);
    const ogImageAlt = altMatch ? altMatch[1] : 'Start Page Preview';

    // Extract favicon - Next.js 13+ uses app/icon.* automatically (supports .png, .svg, .ico)
    // Check if icon files exist in app directory, otherwise fallback to metadata icons
    const srcAppIconPng = path.join(process.cwd(), 'src/app', 'icon.png');
    const srcAppIconSvg = path.join(process.cwd(), 'src/app', 'icon.svg');
    const appIconPng = path.join(process.cwd(), 'app', 'icon.png');
    const appIconSvg = path.join(process.cwd(), 'app', 'icon.svg');
    let favicon = '/favicon.svg'; // Default to favicon.svg (from public directory)
    
    // Check for icon files in app directory (Next.js 13+ convention)
    if (fs.existsSync(srcAppIconSvg)) {
      favicon = '/icon.svg';
    } else if (fs.existsSync(srcAppIconPng)) {
      favicon = '/icon.png';
    } else if (fs.existsSync(appIconSvg)) {
      favicon = '/icon.svg';
    } else if (fs.existsSync(appIconPng)) {
      favicon = '/icon.png';
    } else {
      // If no icon files exist, try to extract from metadata (for backwards compatibility)
      const faviconStringMatch = layoutContent.match(/icon:\s*['"]([^'"]+)['"]/);
      const faviconArrayMatch = layoutContent.match(/icon:\s*\[\s*\{\s*url:\s*['"]([^'"]+)['"]/);
      const faviconRaw = faviconStringMatch?.[1] ?? faviconArrayMatch?.[1] ?? '/favicon.svg';
      favicon = faviconRaw.replace(/\\+\./g, '.');
    }

    const metadata = {
      title,
      description,
      siteUrl,
      ogImage,
      ogImageWidth,
      ogImageHeight,
      ogImageAlt,
      favicon,
    };

    return NextResponse.json(metadata);
  } catch (error) {
    console.error('Error reading metadata:', error);
    return NextResponse.json(
      { error: 'Failed to read metadata' },
      { status: 500 }
    );
  }
}
