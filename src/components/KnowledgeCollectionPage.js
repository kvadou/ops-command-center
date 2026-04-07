import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { formatDate } from '../utils/formatters';
import { useCompanyName } from '../contexts/CompanyNameContext';
import {
  FolderIcon,
  ArrowRightIcon,
  ClockIcon,
  ChatBubbleLeftIcon,
  PencilSquareIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

/**
 * KnowledgeCollectionPage - Display articles in a collection
 */
export default function KnowledgeCollectionPage() {
  const navigate = useNavigate();
  const { collectionId } = useParams();
  const { isMainBranch } = useCompanyName();
  const [collection, setCollection] = useState(null);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCollection();
  }, [collectionId]);

  const fetchCollection = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/knowledge/collections/${collectionId}`);
      const data = await response.json();
      setCollection(data.collection);
      setArticles(data.articles || []);
    } catch (error) {
      console.error('Error fetching collection:', error);
    } finally {
      setLoading(false);
    }
  };



  if (loading) {
    return (
        <div className="max-w-7xl mx-auto w-full text-center py-6">
          <p className="text-neutral-500">Loading...</p>
        </div>
    );
  }

  if (!collection) {
    return (
        <div className="max-w-7xl mx-auto w-full text-center py-6">
          <p className="text-neutral-500">Collection not found</p>
          <Link
            to="/knowledge"
            className="mt-4 inline-block text-brand-purple hover:text-brand-navy"
          >
            ← Back to Knowledge Hub
          </Link>
        </div>
    );
  }

  return (
      <div className="max-w-7xl mx-auto w-full">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <ol className="flex items-center gap-2 text-sm">
            <li>
              <Link
                to="/knowledge"
                className="text-brand-purple hover:text-brand-navy"
              >
                Knowledge Hub
              </Link>
            </li>
            <li className="text-neutral-400">→</li>
            <li className="text-neutral-700 font-medium">{collection.title}</li>
          </ol>
        </nav>

        {/* Collection Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="p-3 bg-gradient-to-br from-brand-purple to-brand-navy rounded-xl">
                <FolderIcon className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-neutral-900 font-heading">
                  {collection.title}
                </h1>
                {collection.description && (
                  <p className="text-neutral-600 mt-2">{collection.description}</p>
                )}
              </div>
            </div>
            
            {/* Admin Actions */}
            {isMainBranch && (
              <div className="flex items-center gap-2">
                <Link
                  to={`/knowledge/admin/articles/new?collection=${collection.id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-green text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium whitespace-nowrap"
                >
                  <PlusIcon className="h-5 w-5" />
                  Add Article
                </Link>
                <Link
                  to={`/knowledge/admin/collections/${collection.id}/edit`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm font-medium whitespace-nowrap"
                >
                  <PencilSquareIcon className="h-5 w-5" />
                  Edit Collection
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Articles List */}
        {articles.length === 0 ? (
          <div className="bg-gradient-to-br from-brand-light/30 to-white rounded-lg border border-neutral-100 p-8 text-center">
            <FolderIcon className="mx-auto h-12 w-12 text-neutral-400 mb-3" />
            <p className="text-sm font-medium text-neutral-700">No articles yet</p>
            <p className="text-sm text-neutral-500 mt-1">
              {isMainBranch 
                ? "Get started by adding your first article to this collection."
                : "Articles will appear here once they're published."
              }
            </p>
            {isMainBranch && (
              <Link
                to={`/knowledge/admin/articles/new?collection=${collection.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 mt-4 bg-brand-green text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
              >
                <PlusIcon className="h-5 w-5" />
                Add First Article
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {articles.map((article) => (
              <Link
                key={article.id}
                to={`/knowledge/articles/${article.id}`}
                className="group bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple transition-all duration-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-neutral-900 mb-2 group-hover:text-brand-purple transition-colors">
                      {article.title}
                    </h3>
                    
                    {article.summary && (
                      <p className="text-sm text-neutral-600 mb-3 line-clamp-2">
                        {article.summary}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <ClockIcon className="h-4 w-4" />
                        {formatDate(article.created_at)}
                      </span>
                      
                      {article.comment_count > 0 && (
                        <span className="flex items-center gap-1">
                          <ChatBubbleLeftIcon className="h-4 w-4" />
                          {article.comment_count} comment{article.comment_count !== 1 ? 's' : ''}
                        </span>
                      )}
                      
                      {article.view_count > 0 && (
                        <span>{article.view_count} view{article.view_count !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  
                  <ArrowRightIcon className="h-5 w-5 text-neutral-400 ml-4 flex-shrink-0 group-hover:text-brand-purple group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
  );
}

