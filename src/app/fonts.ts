import { Archivo, Newsreader, IBM_Plex_Mono } from 'next/font/google';

// Display / headlines — a confident grotesque with newsroom authority.
export const display = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  weight: ['500', '600', '700', '800', '900'],
});

// Body / reading — a serif drawn specifically for on-screen news reading.
export const serif = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-serif',
  style: ['normal', 'italic'],
  weight: ['400', '500', '600'],
});

// Metadata — kickers, datelines, bylines, tags. A "wire terminal" accent.
export const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});
