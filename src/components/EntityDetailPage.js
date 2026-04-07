import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { safeRender } from '../utils/safeRender';
import {
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  ArrowTopRightOnSquareIcon,
  UserIcon,
  AcademicCapIcon,
  ArrowLeftIcon,
  PhotoIcon,
  XMarkIcon,
  PencilSquareIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import PageHeader from './PageHeader';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../hooks/useToast';

// Shared component for entity detail pages with tabs
export default function EntityDetailPage({
  title,
  subtitle,
  status,
  statusColor = 'green',
  tabs = [],
  activeTab,
  onTabChange,
  tutorCruncherUrl,
  extraLinks = [],
  backToListUrl,
  backToListLabel,
  children
}) {

  // Convert statusColor to Badge variant
  const getStatusVariant = (color) => {
    switch (color) {
      case 'green': return 'complete';
      case 'yellow': return 'planned';
      case 'red': return 'cancelled';
      default: return 'editable';
    }
  };

  return (
    <div className="w-full bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
      {/* Header - Mobile Responsive */}
      <PageHeader
        title={safeRender(title)}
        status={null}
        backUrl={backToListUrl}
        backLabel={`Back to ${safeRender(backToListLabel) || 'List'}`}
        externalUrl={tutorCruncherUrl}
        externalLabel="View in TutorCruncher"
        extraLinks={extraLinks}
      />
      {subtitle && (
        <div className="bg-white border-b border-neutral-200">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-2">
            <p className="text-sm text-neutral-500">
              {safeRender(subtitle)}
            </p>
          </div>
        </div>
      )}

      {/* Tabs - Mobile Responsive */}
      {tabs.length > 0 && (
        <div className="bg-white border-b border-neutral-200">
          <div className="w-full px-4 sm:px-6 lg:px-6 xl:px-8">
            <nav className="flex space-x-4 sm:space-x-8 overflow-x-auto scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`
                      py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap
                      flex items-center gap-2 min-h-[44px] sm:min-h-0
                      ${activeTab === tab.id
                        ? 'border-brand-purple text-brand-purple'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                      }
                    `}
                  >
                    {Icon && <Icon className="h-5 w-5 flex-shrink-0" />}
                    <span>{safeRender(tab.name)}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="w-full px-4 sm:px-6 lg:px-6 xl:px-8 py-4 sm:py-6">
        {children}
      </div>
    </div>
  );
}

// Helper to safely convert any value to string - use safeRender from utils instead
const safeString = (value) => {
  const rendered = safeRender(value);
  return rendered === null || rendered === undefined ? '' : String(rendered);
};

// Helper component for contact info display
export function ContactInfo({ email, phone, mobile, address, photo, localImageUrl, contractorId, onImageUpdate, placeholderIcon }) {
  const [imageError, setImageError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '', isDestructive: false });
  const toast = useToast();
  const fileInputRef = React.useRef(null);
  
  const safeEmail = safeString(email);
  const safePhone = safeString(phone);
  const safeMobile = safeString(mobile);
  const safeAddress = safeString(address);
  // Prefer local_image_url over photo from TutorCruncher
  const imageUrl = safeString(localImageUrl) || safeString(photo);
  
  const handleImageError = () => {
    setImageError(true);
  };
  
  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff', 'image/x-icon'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload an image file (JPEG, PNG, GIF, WebP, SVG, BMP, TIFF, or ICO).');
      return;
    }
    
    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB.');
      return;
    }
    
    if (!contractorId) {
      toast.error('Cannot upload photo: Tutor ID not available.');
      return;
    }
    
    setUploading(true);
    setShowUploadMenu(false);
    
    try {
      const formData = new FormData();
      formData.append('photo', file);
      
      const response = await fetch(`/api/tutor-photo/${contractorId}`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed', details: `HTTP ${response.status}` }));
        const errorMessage = errorData.error || 'Upload failed';
        const errorDetails = errorData.details || errorData.message || '';
        throw new Error(errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage);
      }
      
      const data = await response.json();
      
      if (!data.success || !data.imageUrl) {
        throw new Error(data.error || 'Upload succeeded but no image URL was returned');
      }
      
      // Reset image error state and trigger refresh
      setImageError(false);
      if (onImageUpdate) {
        onImageUpdate(data.imageUrl);
      } else {
        // Reload the page to show the new image
        window.location.reload();
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      const errorMessage = error.message || 'Failed to upload photo';
      toast.error(errorMessage);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  const handleDeletePhoto = async () => {
    if (!contractorId) return;

    setConfirmState({
      isOpen: true,
      title: 'Delete Photo',
      message: 'Are you sure you want to delete this photo?',
      isDestructive: true,
      action: async () => {
        try {
          const response = await fetch(`/api/tutor-photo/${contractorId}`, {
            method: 'DELETE',
            credentials: 'include'
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Delete failed');
          }

          // Reset image error state and trigger refresh
          setImageError(false);
          if (onImageUpdate) {
            onImageUpdate(null);
          } else {
            // Reload the page
            window.location.reload();
          }
        } catch (error) {
          console.error('Error deleting photo:', error);
          toast.error(`Failed to delete photo: ${error.message}`);
        }
      }
    });
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-4 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="relative group flex-shrink-0">
          {imageUrl && !imageError ? (
            <img
              src={imageUrl}
              alt="Profile"
              className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover"
              loading="lazy"
              onError={handleImageError}
            />
        ) : (
          <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-brand-purple flex items-center justify-center text-white">
            {placeholderIcon ? (
              React.createElement(placeholderIcon, { className: "h-8 w-8 sm:h-10 sm:w-10" })
            ) : (
              <AcademicCapIcon className="h-8 w-8 sm:h-10 sm:w-10" />
            )}
          </div>
        )}
          {contractorId && (
            <div className="absolute inset-0 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="p-1 bg-white rounded text-xs hover:bg-neutral-100 disabled:opacity-50"
                  title="Upload photo"
                >
                  <PhotoIcon className="h-4 w-4 text-neutral-700" />
                </button>
                {imageUrl && !imageError && (
                  <button
                    onClick={handleDeletePhoto}
                    className="p-1 bg-white rounded text-xs hover:bg-neutral-100"
                    title="Delete photo"
                  >
                    <XMarkIcon className="h-4 w-4 text-red-600" />
                  </button>
                )}
              </div>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black bg-opacity-50 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,image/bmp,image/tiff,image/x-icon"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-neutral-900 mb-3 sm:mb-4">Contact</h3>
          <div className="space-y-2">
            {safeEmail && (
              <div className="flex items-start sm:items-center text-neutral-600">
                <EnvelopeIcon className="h-5 w-5 mr-2 text-neutral-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                <a 
                  href={`mailto:${safeEmail}`} 
                  className="hover:text-brand-purple break-words break-all min-w-0"
                  style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                >
                  {safeEmail}
                </a>
              </div>
            )}
            {safePhone && (
              <div className="flex items-center text-neutral-600">
                <PhoneIcon className="h-5 w-5 mr-2 text-neutral-400 flex-shrink-0" />
                <a 
                  href={`tel:${safePhone}`} 
                  className="hover:text-brand-purple break-words"
                  style={{ wordBreak: 'break-word' }}
                >
                  {safePhone}
                </a>
              </div>
            )}
            {safeMobile && safeMobile !== safePhone && (
              <div className="flex items-center text-neutral-600">
                <PhoneIcon className="h-5 w-5 mr-2 text-neutral-400 flex-shrink-0" />
                <a 
                  href={`tel:${safeMobile}`} 
                  className="hover:text-brand-purple break-words"
                  style={{ wordBreak: 'break-word' }}
                >
                  {safeMobile}
                </a>
              </div>
            )}
            {safeAddress && (
              <div className="flex items-start text-neutral-600">
                <MapPinIcon className="h-5 w-5 mr-2 text-neutral-400 mt-0.5 flex-shrink-0" />
                <span 
                  className="break-words min-w-0"
                  style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                >
                  {safeAddress}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          setConfirmState(prev => ({ ...prev, isOpen: false }));
          if (confirmState.action) await confirmState.action();
        }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive={confirmState.isDestructive}
      />
    </div>
  );
}

// Helper component for related entities list
export function RelatedEntitiesList({
  title,
  entities,
  entityType,
  getLink,
  getName,
  getSubtitle,
  emptyMessage = 'No items found',
  addButton = null, // Optional button/link to add a new entity
  onDelete = null, // Optional delete handler function(entity) => Promise<void>
  getDeleteId = null // Optional function to get the ID for deletion (entity) => id
}) {
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '', isDestructive: false });
  const toast = useToast();

  if (!entities || entities.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
          {addButton}
        </div>
        <p className="text-neutral-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
        {addButton}
      </div>
      <div className="space-y-3">
        {entities.map((entity, idx) => {
          const link = getLink(entity);
          const name = getName(entity);
          const subtitle = getSubtitle ? getSubtitle(entity) : null;
          
          // Ensure name and subtitle are strings using safeRender
          const nameStr = safeRender(name) || 'Unknown';
          const subtitleStr = subtitle ? safeRender(subtitle) : null;
          
          const deleteId = getDeleteId ? getDeleteId(entity) : (entity.recipient_id || entity.id);
          
          return (
            <div key={idx} className="border-b border-neutral-200 pb-3 last:border-0">
              <div className="flex items-start justify-between group">
                <div className="flex-1">
                  {link ? (
                    <Link
                      to={link}
                      className="block hover:bg-neutral-50 p-2 rounded transition-colors"
                    >
                      <div className="font-medium text-brand-purple hover:text-brand-navy">
                        {nameStr}
                      </div>
                      {subtitleStr && (
                        <div className="text-sm text-neutral-500 mt-1">{subtitleStr}</div>
                      )}
                    </Link>
                  ) : (
                    <div className="p-2">
                      <div className="font-medium text-neutral-900">{nameStr}</div>
                      {subtitleStr && (
                        <div className="text-sm text-neutral-500 mt-1">{subtitleStr}</div>
                      )}
                    </div>
                  )}
                </div>
                {onDelete && deleteId && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setConfirmState({
                        isOpen: true,
                        title: 'Delete',
                        message: `Are you sure you want to delete ${nameStr}?`,
                        isDestructive: true,
                        action: async () => {
                          try {
                            await onDelete(entity);
                          } catch (error) {
                            console.error('Error deleting:', error);
                            toast.error('Failed to delete. Please try again.');
                          }
                        }
                      });
                    }}
                    className="ml-2 p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                    title={`Delete ${nameStr}`}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          setConfirmState(prev => ({ ...prev, isOpen: false }));
          if (confirmState.action) await confirmState.action();
        }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive={confirmState.isDestructive}
      />
    </div>
  );
}

