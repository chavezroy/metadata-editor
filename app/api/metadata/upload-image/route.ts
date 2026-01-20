import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export async function POST(request: NextRequest) {
  // Only allow in development mode
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This API is only available in development mode' },
      { status: 403 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'og' or 'favicon'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Determine file extension
    const ext = path.extname(file.name);

    // Generate filename based on type
    const filename = type === 'og' ? `og-image${ext}` : `favicon${ext}`;

    // Ensure public directory exists
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Save to public directory
    const publicPath = path.join(publicDir, filename);
    fs.writeFileSync(publicPath, buffer);

    // Get file metadata
    const size = buffer.length;
    const uploadDate = new Date().toISOString();

    // Get image dimensions for OG images
    let width, height;
    if (type === 'og') {
      try {
        const metadata = await sharp(buffer).metadata();
        width = metadata.width;
        height = metadata.height;
      } catch (error) {
        console.error('Failed to get image dimensions:', error);
      }
    }

    // Return the public URL and metadata
    const url = `/${filename}`;

    return NextResponse.json({
      success: true,
      url,
      size,
      uploadDate,
      width,
      height,
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  }
}
