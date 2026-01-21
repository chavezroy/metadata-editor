import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Try to serve favicon.ico from public folder first
    const publicFavicon = path.join(process.cwd(), 'public', 'favicon.ico');
    if (fs.existsSync(publicFavicon)) {
      const fileBuffer = fs.readFileSync(publicFavicon);
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'image/x-icon',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Fallback: try to serve icon.svg as favicon
    const iconSvg = path.join(process.cwd(), 'app', 'icon.svg');
    if (fs.existsSync(iconSvg)) {
      const fileBuffer = fs.readFileSync(iconSvg);
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Fallback: try favicon.png from public
    const faviconPng = path.join(process.cwd(), 'public', 'favicon.png');
    if (fs.existsSync(faviconPng)) {
      const fileBuffer = fs.readFileSync(faviconPng);
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Return 204 No Content if no favicon found (prevents 404)
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error serving favicon:', error);
    return new NextResponse(null, { status: 204 });
  }
}
