import { Link } from 'react-router-dom';
import { HomeIcon } from '@heroicons/react/24/outline';

export default function NotFound({ entityType = 'Entity', entityId = null }) {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-brand-purple">404</h1>
          <h2 className="text-3xl font-bold text-neutral-900 mt-4">
            {entityType} Not Found
          </h2>
          {entityId && (
            <p className="text-neutral-600 mt-2">
              The {entityType.toLowerCase()} with ID <strong>{entityId}</strong> could not be found.
            </p>
          )}
          {!entityId && (
            <p className="text-neutral-600 mt-2">
              The {entityType.toLowerCase()} you're looking for doesn't exist or has been removed.
            </p>
          )}
        </div>
        
        <div className="space-y-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors"
          >
            <HomeIcon className="h-5 w-5" />
            Go to Dashboard
          </Link>
          
          <div className="text-sm text-neutral-500">
            <p>This could happen if:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>The {entityType.toLowerCase()} was deleted</li>
              <li>The ID is incorrect</li>
              <li>You don't have access to this {entityType.toLowerCase()}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

