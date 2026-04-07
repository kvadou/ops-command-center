import React, { useState } from 'react';
import EntityListPage from './EntityListPage';
import { Link } from 'react-router-dom';
import ReviewDetailModal from './ReviewDetailModal';
import StarRating from './StarRating';

export default function ReviewsPage() {
  const [selectedReview, setSelectedReview] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getRowData = (review) => ({
    id: review.id,
    rating: review.rating,
    reviewText: review.review_text,
    client: review.client_name,
    clientId: review.client_id,
    contractor: review.contractor_name,
    contractorId: review.contractor_id,
    date: review.date_created
  });

  const handleRowClick = (review) => {
    setSelectedReview(review);
    setIsModalOpen(true);
  };

  const columns = [
    {
      key: 'rating',
      label: 'Rating',
      render: (review) => (
        <div className="flex items-center">
          <StarRating 
            rating={review.rating || 0} 
            maxRating={5}
            size="md"
            showValue={true}
          />
        </div>
      ),
      sortable: true
    },
    {
      key: 'reviewText',
      label: 'Review',
      render: (review) => (
        <div 
          className="text-sm text-neutral-700 max-w-md cursor-pointer hover:text-brand-purple"
          onClick={() => handleRowClick(review)}
          title={review.reviewText || 'Click to view full review'}
        >
          {review.reviewText ? (
            <span className="line-clamp-2">
              {review.reviewText}
            </span>
          ) : (
            <span className="text-neutral-400 italic">No review text</span>
          )}
        </div>
      )
    },
    {
      key: 'client',
      label: 'Client',
      render: (review) => (
        review.clientId ? (
          <Link 
            to={`/clients/${review.clientId}`}
            className="text-sm font-medium text-brand-purple hover:text-brand-navy"
            onClick={(e) => e.stopPropagation()}
          >
            {review.client || '—'}
          </Link>
        ) : (
          <span className="text-sm text-neutral-500">{review.client || '—'}</span>
        )
      )
    },
    {
      key: 'contractor',
      label: 'Tutor',
      render: (review) => (
        review.contractorId ? (
          <Link 
            to={`/tutors/${review.contractorId}`}
            className="text-sm font-medium text-brand-purple hover:text-brand-navy"
            onClick={(e) => e.stopPropagation()}
          >
            {review.contractor || '—'}
          </Link>
        ) : (
          <span className="text-sm text-neutral-500">{review.contractor || '—'}</span>
        )
      )
    },
    {
      key: 'date',
      label: 'Date',
      render: (review) => (
        <div className="text-sm text-neutral-900">
          {review.date ? new Date(review.date).toLocaleDateString() : '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (review) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRowClick(review);
          }}
          className="px-3 py-1.5 text-sm font-medium text-brand-purple hover:text-brand-navy hover:bg-brand-light/30 rounded-lg transition-colors"
        >
          View Details
        </button>
      )
    }
  ];

  const filters = [
    {
      key: 'client_id',
      label: 'Client',
      type: 'autocomplete',
      endpoint: '/api/entity-lists/clients',
      getOptionLabel: (option) => option.name || `${option.first_name} ${option.last_name}`,
      getOptionValue: (option) => option.client_id || option.id
    },
    {
      key: 'contractor_id',
      label: 'Tutor',
      type: 'autocomplete',
      endpoint: '/api/entity-lists/tutors',
      getOptionLabel: (option) => option.name || `${option.first_name} ${option.last_name}`,
      getOptionValue: (option) => option.contractor_id || option.id
    },
    {
      key: 'min_rating',
      label: 'Min Rating',
      type: 'number',
      min: 1,
      max: 5,
      step: 0.5
    },
    {
      key: 'max_rating',
      label: 'Max Rating',
      type: 'number',
      min: 1,
      max: 5,
      step: 0.5
    },
    {
      key: 'start_date',
      label: 'Start Date',
      type: 'date'
    },
    {
      key: 'end_date',
      label: 'End Date',
      type: 'date'
    }
  ];

  const getEntityLink = (review) => {
    // Return hash to prevent navigation - we use modal instead
    return '#';
  };

  return (
    <>
      <EntityListPage
        title="Reviews"
        entityType="reviews"
        apiEndpoint="reviews"
        getRowData={getRowData}
        columns={columns}
        searchPlaceholder="Search reviews, clients, or tutors..."
        filters={filters}
        getEntityLink={getEntityLink}
      />
      <ReviewDetailModal
        review={selectedReview}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedReview(null);
        }}
      />
    </>
  );
}

