'use client';

import { useState } from 'react';

/** Main image with thumbnail selection and a click-to-zoom toggle. Keyboard: thumbnails are buttons. */
export function ProductGallery({ images, alt, locale }: { images: Array<{ id: string; url: string; altText: string | null }>; alt: string; locale: 'ar' | 'en' }) {
  const ar = locale === 'ar';
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  if (images.length === 0) {
    return (
      <div className="pdp-main">
        <span className="muted">{ar ? 'بلا صورة' : 'No image'}</span>
      </div>
    );
  }
  const current = images[Math.min(index, images.length - 1)];
  return (
    <div className="pdp-gallery">
      <button type="button" className="pdp-main" onClick={() => setZoom(!zoom)} aria-pressed={zoom} aria-label={ar ? 'تكبير الصورة' : 'Zoom image'} style={{ cursor: zoom ? 'zoom-out' : 'zoom-in', padding: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={current.altText ?? alt} style={zoom ? { transform: 'scale(1.6)', objectFit: 'contain' } : undefined} />
      </button>
      {images.length > 1 && (
        <div className="pdp-thumbs" role="list" aria-label={ar ? 'صور المنتج' : 'Product images'}>
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              role="listitem"
              onClick={() => setIndex(i)}
              aria-current={i === index ? 'true' : undefined}
              aria-label={`${ar ? 'صورة' : 'Image'} ${i + 1}`}
              style={{ padding: 0, border: 0, background: 'none', outline: i === index ? '2px solid var(--brand)' : 'none', borderRadius: 6 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
