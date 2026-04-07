import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import StarRating from './StarRating';

export default function ReviewDetailModal({ review, isOpen, onClose }) {
  if (!isOpen || !review) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-neutral-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-navy via-brand-purple to-brand-navy px-6 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Review Details</h3>
              <button
                onClick={onClose}
                className="text-white hover:text-neutral-200 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white px-6 py-6">
            {/* Rating */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Rating
              </label>
              <StarRating 
                rating={review.rating || 0} 
                maxRating={5}
                size="lg"
                showValue={true}
              />
            </div>

            {/* Review Text */}
            {review.review_text && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Review
                </label>
                <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                  <p className="text-sm text-neutral-700 whitespace-pre-wrap">
                    {review.review_text}
                  </p>
                </div>
              </div>
            )}

            {/* Client */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Client
              </label>
              {review.clientId ? (
                <Link
                  to={`/clients/${review.clientId}`}
                  className="text-sm font-medium text-brand-purple hover:text-brand-navy"
                >
                  {review.client || 'Unknown Client'}
                </Link>
              ) : (
                <span className="text-sm text-neutral-500">
                  {review.client || 'Unknown Client'}
                </span>
              )}
            </div>

            {/* Tutor */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Tutor
              </label>
              {review.contractorId ? (
                <Link
                  to={`/tutors/${review.contractorId}`}
                  className="text-sm font-medium text-brand-purple hover:text-brand-navy"
                >
                  {review.contractor || 'Unknown Tutor'}
                </Link>
              ) : (
                <span className="text-sm text-neutral-500">
                  {review.contractor || 'Unknown Tutor'}
                </span>
              )}
            </div>

            {/* Date */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Date Created
              </label>
              <span className="text-sm text-neutral-600">
                {review.date ? new Date(review.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                }) : '—'}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-neutral-50 px-6 py-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

