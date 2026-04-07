/**
 * MediaGallery - Multi-image/video gallery component
 * 
 * Displays media in an attractive grid layout with:
 * - Single image: Full width
 * - Two images: Side by side
 * - Three images: One large + two small
 * - Four+ images: Grid with "more" indicator
 * - Video support
 * - Lightbox modal for viewing
 */

import React, { useState } from 'react';
import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
} from '@heroicons/react/24/solid';

const MediaGallery = ({ media = [] }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Normalize media format
  const normalizedMedia = media.map(item => {
    if (typeof item === 'string') {
      const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(item);
      return { url: item, type: isVideo ? 'video' : 'image' };
    }
    return item;
  });

  const openLightbox = (index) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    document.body.style.overflow = '';
  };

  const nextImage = () => {
    setLightboxIndex((prev) => (prev + 1) % normalizedMedia.length);
  };

  const prevImage = () => {
    setLightboxIndex((prev) => (prev - 1 + normalizedMedia.length) % normalizedMedia.length);
  };

  // Handle keyboard navigation
  React.useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'ArrowLeft') prevImage();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen]);

  if (normalizedMedia.length === 0) return null;

  // Render single media item
  const renderMediaItem = (item, index, className = '') => {
    const isVideo = item.type === 'video';

    return (
      <div
        key={index}
        onClick={() => openLightbox(index)}
        className={`relative cursor-pointer overflow-hidden rounded-lg bg-neutral-100 ${className}`}
      >
        {isVideo ? (
          <>
            <video
              src={item.url}
              className="w-full h-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                <PlayIcon className="h-6 w-6 text-neutral-800 ml-1" />
              </div>
            </div>
          </>
        ) : (
          <img
            src={item.url}
            alt={`Media ${index + 1}`}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        )}
      </div>
    );
  };

  // Layout based on number of images
  const renderGallery = () => {
    const count = normalizedMedia.length;

    if (count === 1) {
      return (
        <div className="aspect-video max-h-96">
          {renderMediaItem(normalizedMedia[0], 0, 'w-full h-full')}
        </div>
      );
    }

    if (count === 2) {
      return (
        <div className="grid grid-cols-2 gap-1 aspect-video max-h-80">
          {normalizedMedia.slice(0, 2).map((item, i) => 
            renderMediaItem(item, i, 'w-full h-full')
          )}
        </div>
      );
    }

    if (count === 3) {
      return (
        <div className="grid grid-cols-2 gap-1 aspect-video max-h-80">
          <div className="row-span-2">
            {renderMediaItem(normalizedMedia[0], 0, 'w-full h-full')}
          </div>
          <div className="grid grid-rows-2 gap-1">
            {renderMediaItem(normalizedMedia[1], 1, 'w-full h-full')}
            {renderMediaItem(normalizedMedia[2], 2, 'w-full h-full')}
          </div>
        </div>
      );
    }

    // 4 or more images
    return (
      <div className="grid grid-cols-2 gap-1 aspect-video max-h-80">
        {normalizedMedia.slice(0, 4).map((item, i) => (
          <div key={i} className="relative">
            {renderMediaItem(item, i, 'w-full h-full aspect-square')}
            {i === 3 && count > 4 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                <span className="text-white text-2xl font-bold">
                  +{count - 4}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {renderGallery()}

      {/* Lightbox Modal */}
      {lightboxOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close Button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>

          {/* Navigation Arrows */}
          {normalizedMedia.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prevImage();
                }}
                className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
              >
                <ChevronLeftIcon className="h-8 w-8" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  nextImage();
                }}
                className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
              >
                <ChevronRightIcon className="h-8 w-8" />
              </button>
            </>
          )}

          {/* Media Display */}
          <div 
            className="max-w-[90vw] max-h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {normalizedMedia[lightboxIndex]?.type === 'video' ? (
              <video
                src={normalizedMedia[lightboxIndex].url}
                className="max-w-full max-h-[90vh] rounded-lg"
                controls
                autoPlay
              />
            ) : (
              <img
                src={normalizedMedia[lightboxIndex]?.url}
                alt={`Media ${lightboxIndex + 1}`}
                className="max-w-full max-h-[90vh] rounded-lg object-contain"
              />
            )}
          </div>

          {/* Image Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm">
            {lightboxIndex + 1} / {normalizedMedia.length}
          </div>

          {/* Thumbnail Strip */}
          {normalizedMedia.length > 1 && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-2">
              {normalizedMedia.map((item, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex(i);
                  }}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                    i === lightboxIndex 
                      ? 'border-white scale-110' 
                      : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  {item.type === 'video' ? (
                    <div className="w-full h-full bg-neutral-700 flex items-center justify-center">
                      <PlayIcon className="h-4 w-4 text-white" />
                    </div>
                  ) : (
                    <img
                      src={item.url}
                      alt={`Thumbnail ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default MediaGallery;

