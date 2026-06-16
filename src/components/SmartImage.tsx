/**
 * Plain, host-agnostic responsive image. Because the site is a static export
 * aggregating images from many third-party domains, we avoid next/image's
 * remote-host allow-listing and instead render a well-behaved <img>:
 *  - explicit width/height reserve layout space (no CLS)
 *  - object-fit cover via the wrapping aspect-ratio box (see CSS)
 *  - lazy + async decoding by default; callers can opt into eager for heroes.
 */
type Props = {
  src: string | null;
  alt: string;
  width: number;
  height: number;
  className?: string;
  sizes?: string;
  /** Candidate set (e.g. "thumb.webp 640w, hero.webp 1280w"); pairs with `sizes`. */
  srcSet?: string;
  priority?: boolean;
};

export function SmartImage({ src, alt, width, height, className, sizes, srcSet, priority = false }: Props) {
  if (!src) {
    return <div className={className} role="img" aria-label={alt} data-placeholder="true" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      srcSet={srcSet}
      // `sizes` is only honoured by browsers when a `srcSet` is present.
      sizes={srcSet ? sizes : undefined}
      className={className}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'auto' : 'async'}
      fetchPriority={priority ? 'high' : undefined}
    />
  );
}
