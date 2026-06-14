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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#101113' },
  ],
  colorScheme: 'light dark',
};

// Runs before paint: applies the saved theme (or the OS preference) to <html>
// so there is no flash of the wrong colour scheme.
const themeBootScript = `(function(){try{var t=localStorage.getItem('nnn-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-GB"
      className={`${display.variable} ${serif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
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
