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

    let filePath: string;
    let url: string;

    if (type === 'og') {
      // OG images go to public directory
      const filename = `og-image${ext}`;
      const publicDir = path.join(process.cwd(), 'public');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      filePath = path.join(publicDir, filename);
      url = `/${filename}`;
    } else {
      // Favicons go to app/icon.png (Next.js 13+ uses this automatically)
      // Try src/app first, then fall back to app
      const srcAppDir = path.join(process.cwd(), 'src/app');
      const appDir = path.join(process.cwd(), 'app');
      const targetAppDir = fs.existsSync(srcAppDir) ? srcAppDir : appDir;
      
      // Remove old favicon.ico if it exists
      const oldFaviconPath = path.join(targetAppDir, 'favicon.ico');
      if (fs.existsSync(oldFaviconPath)) {
        fs.unlinkSync(oldFaviconPath);
      }

      // Remove old icon files if they exist
      const oldIconPng = path.join(targetAppDir, 'icon.png');
      const oldIconSvg = path.join(targetAppDir, 'icon.svg');
      if (fs.existsSync(oldIconPng)) {
        fs.unlinkSync(oldIconPng);
      }
      if (fs.existsSync(oldIconSvg)) {
        fs.unlinkSync(oldIconSvg);
      }

      // Save as icon with original extension (Next.js 13+ supports icon.png, icon.svg, etc.)
      const iconExt = ext.toLowerCase() === '.svg' ? '.svg' : '.png';
      filePath = path.join(targetAppDir, `icon${iconExt}`);
      url = `/icon${iconExt}`; // Next.js serves app/icon.* at /icon.*
    }

    // Save the file
    fs.writeFileSync(filePath, buffer);

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

    // Return the URL and metadata
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
