import 'server-only';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({ gfm: true, breaks: false });

/**
 * Convert article Markdown to sanitised HTML at build time. The daily AI task
 * provides Markdown bodies; sanitising guards against any injected markup.
 */
export function renderMarkdown(markdown: string): string {
  const raw = marked.parse(markdown, { async: false }) as string;
  return sanitizeHtml(raw, {
    allowedTags: [
      'h2', 'h3', 'h4', 'p', 'a', 'ul', 'ol', 'li', 'blockquote', 'strong',
      'em', 'code', 'pre', 'br', 'hr', 'figure', 'figcaption', 'img', 'div',
      'iframe', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
      iframe: ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy'],
      div: ['class'],
      figure: ['class'],
      td: ['align'],
      th: ['align'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    // Only allow video embeds from trusted, privacy-respecting hosts.
    allowedIframeHostnames: ['www.youtube-nocookie.com', 'www.youtube.com', 'player.vimeo.com'],
    allowIframeRelativeUrls: false,
    allowedClasses: { div: ['video'], figure: ['media'] },
    transformTags: {
      // External links open safely.
      a: (tagName, attribs) => {
        const href = attribs.href || '';
        const external = /^https?:\/\//i.test(href);
        return {
          tagName,
          attribs: external
            ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
            : attribs,
        };
      },
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, loading: 'lazy', decoding: 'async' },
      }),
    },
  });
}
