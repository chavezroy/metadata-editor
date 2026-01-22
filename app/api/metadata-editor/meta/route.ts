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

    // Normalize URL - add protocol if missing
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      // Try https first, fallback to http if needed
      normalizedUrl = `https://${normalizedUrl}`;
    }

    // Validate URL
    let targetUrl: URL;
    try {
      targetUrl = new URL(normalizedUrl);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format. Please include http:// or https://' },
        { status: 400 }
      );
    }

    // Fetch the HTML from the external URL with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    let response: Response;
    try {
      response = await fetch(targetUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FinterestMetadataBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout - URL took too long to respond' },
          { status: 408 }
        );
      }
      throw fetchError;
    }

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
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout - URL took too long to respond' },
          { status: 408 }
        );
      }
      
      // Provide more specific error messages
      if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
        return NextResponse.json(
          { error: 'Failed to connect to the URL. Please check if the URL is correct and accessible.' },
          { status: 503 }
        );
      }
      
      return NextResponse.json(
        { error: error.message || 'Failed to fetch external metadata' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch external metadata' },
      { status: 500 }
    );
  }
}
