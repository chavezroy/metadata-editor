import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
  (process.env.AWS_BRANCH && process.env.AWS_APP_ID ? `https://${process.env.AWS_BRANCH}.${process.env.AWS_APP_ID}.amplifyapp.com` : 
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'));

export const metadata: Metadata = {
  title: 'Metadata Editor Test',
  description: 'Test page for metadata editor',
  // Icons are handled automatically by Next.js via app/icon.png
  openGraph: {
    title: 'Metadata Editor Test',
    description: 'Test page for metadata editor',
    url: siteUrl,
    siteName: 'Metadata Editor Test',
    images: [
      {
        url: `${siteUrl}/og-image.jpg?t=1768973539630`,
        width: 1200,
        height: 630,
        alt: 'Metadata Editor Test',
      },
    ],    videos: [
      {
        url: `${siteUrl}/og-vid.mp4`,
        type: 'video/mp4',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Metadata Editor Test',
    description: 'Test page for metadata editor',
    images: [`${siteUrl}/og-image.jpg?t=1768973539630`],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
