import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { display, serif, mono } from './fonts';
import { SITE } from '@/lib/site';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import './globals.css';

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT; // e.g. ca-pub-XXXXXXXXXXXX

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.name }],
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    locale: SITE.locale,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: [{ url: '/logo/og-default.png', width: 1200, height: 630, alt: SITE.name }],
  },
  twitter: {
    card: 'summary_large_image',
    site: SITE.social.twitter,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: ['/logo/og-default.png'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${display.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <Header />
        <main id="main" className="site-main" tabIndex={-1}>
          {children}
        </main>
        <Footer />

        {ADSENSE_CLIENT ? (
          <Script
            id="adsbygoogle-init"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          />
        ) : null}
      </body>
    </html>
  );
}
