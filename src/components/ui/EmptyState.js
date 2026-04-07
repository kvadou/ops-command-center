import React from 'react';
import Button from './Button';

/**
 * Empty State component for friendly illustrations and CTAs
 * 
 * @param {string} title - Main headline
 * @param {string} subtitle - Description text
 * @param {string} ctaText - Button text
 * @param {function} onCtaClick - CTA button click handler
 * @param {React.ReactNode} illustration - Optional custom illustration
 */
export default function EmptyState({ 
  title, 
  subtitle, 
  ctaText, 
  onCtaClick,
  illustration 
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      {illustration ? (
        illustration
      ) : (
        <div className="w-24 h-24 mb-6 rounded-full bg-primary-50 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-primary-300"></div>
          </div>
        </div>
      )}
      <h3 className="text-lg font-semibold text-neutral-900 mb-2">{title}</h3>
      <p className="text-sm text-neutral-600 max-w-md mb-6">{subtitle}</p>
      {ctaText && onCtaClick && (
        <Button variant="primary" size="md" onClick={onCtaClick}>
          {ctaText}
        </Button>
      )}
    </div>
  );
}














