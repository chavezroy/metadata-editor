import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Allow in production - this is a read-only operation that fetches external metadata
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { status: 400 }
      );
    }

    // Validate URL
    let targetUrl: URL;
    try {
      targetUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Fetch the HTML from the external URL
    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FinterestMetadataBot/1.0)',
      },
      // Add timeout
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.statusText}` },
        { status: response.status }
      );
    }

    const html = await response.text();

    // Extract metadata from HTML
    const metadata: {
      title?: string;
      description?: string;
      image?: string;
      favicon?: string;
      hostname?: string;
    } = {
      hostname: targetUrl.hostname,
    };

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
    }

    // Extract Open Graph title
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    if (ogTitleMatch) {
      metadata.title = ogTitleMatch[1].trim();
    }

    // Extract description
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    if (descMatch) {
      metadata.description = descMatch[1].trim();
    }

    // Extract Open Graph description
    const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
    if (ogDescMatch) {
      metadata.description = ogDescMatch[1].trim();
    }

    // Extract Open Graph image
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogImageMatch) {
      let imageUrl = ogImageMatch[1].trim();
      // Convert relative URLs to absolute
      if (imageUrl.startsWith('/')) {
        imageUrl = `${targetUrl.protocol}//${targetUrl.host}${imageUrl}`;
      } else if (!imageUrl.startsWith('http')) {
        imageUrl = `${targetUrl.protocol}//${targetUrl.host}/${imageUrl}`;
      }
      metadata.image = imageUrl;
    }

    // Extract Twitter image as fallback
    if (!metadata.image) {
      const twitterImageMatch = html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
      if (twitterImageMatch) {
        let imageUrl = twitterImageMatch[1].trim();
        if (imageUrl.startsWith('/')) {
          imageUrl = `${targetUrl.protocol}//${targetUrl.host}${imageUrl}`;
        } else if (!imageUrl.startsWith('http')) {
          imageUrl = `${targetUrl.protocol}//${targetUrl.host}/${imageUrl}`;
        }
        metadata.image = imageUrl;
      }
    }

    // Extract favicon
    const faviconMatch = html.match(/<link[^>]+rel=["'](?:shortcut\s+)?icon["'][^>]+href=["']([^"']+)["']/i);
    if (faviconMatch) {
      let faviconUrl = faviconMatch[1].trim();
      if (faviconUrl.startsWith('/')) {
        faviconUrl = `${targetUrl.protocol}//${targetUrl.host}${faviconUrl}`;
      } else if (!faviconUrl.startsWith('http')) {
        faviconUrl = `${targetUrl.protocol}//${targetUrl.host}/${faviconUrl}`;
      }
      metadata.favicon = faviconUrl;
    }

    // Fallback to default favicon location
    if (!metadata.favicon) {
      metadata.favicon = `${targetUrl.protocol}//${targetUrl.host}/favicon.ico`;
    }

    return NextResponse.json(metadata);
  } catch (error) {
    console.error('Error fetching external metadata:', error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timeout - URL took too long to respond' },
        { status: 408 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch external metadata' },
      { status: 500 }
    );
  }
}
