import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate } from '../utils/formatters';
import {
  MagnifyingGlassIcon,
  RocketLaunchIcon,
  MegaphoneIcon,
  CogIcon,
  AcademicCapIcon,
  FolderIcon,
  SparklesIcon,
  ClockIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

/**
 * KnowledgeHubPage - Main landing page for Knowledge Hub
 * Features category cards, search, recent articles, and help section
 */
export default function KnowledgeHubPage() {
  const navigate = useNavigate();
  const [collections, setCollections] = useState([]);
  const [recentArticles, setRecentArticles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch collections
      const collectionsResponse = await fetch('/api/knowledge/collections?published_only=true');
      const collectionsData = await collectionsResponse.json();
      setCollections(collectionsData.collections || []);

      // Fetch recent articles
      const articlesResponse = await fetch('/api/knowledge/articles?published_only=true');
      const articlesData = await articlesResponse.json();
      const sorted = (articlesData.articles || []).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setRecentArticles(sorted.slice(0, 5));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/knowledge/search?q=${encodeURIComponent(searchQuery)}`;
    }
  };

  const getCollectionIcon = (icon) => {
    const iconMap = {
      rocket: RocketLaunchIcon,
      megaphone: MegaphoneIcon,
      cog: CogIcon,
      academic: AcademicCapIcon,
      folder: FolderIcon,
      sparkles: SparklesIcon,
    };
    return iconMap[icon] || FolderIcon;
  };

  const getCollectionColor = (index) => {
    const colors = [
      'from-purple-500 to-purple-600',
      'from-blue-500 to-blue-600',
      'from-green-500 to-green-600',
      'from-yellow-500 to-yellow-600',
      'from-pink-500 to-pink-600',
      'from-indigo-500 to-indigo-600',
    ];
    return colors[index % colors.length];
  };


  return (
      <div className="max-w-7xl mx-auto w-full">
        {/* Hero Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-brand-purple to-brand-navy rounded-xl">
              <SparklesIcon className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 font-heading">
                Welcome to Knowledge Hub
              </h1>
              <p className="text-neutral-600 mt-1">
                Everything you need to know about running your Acme Operations franchise
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="mt-6">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for articles, guides, and resources..."
                className="w-full pl-12 pr-4 py-4 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent text-lg"
              />
            </div>
          </form>
        </div>

        {/* Collections Grid */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-neutral-900 mb-4">Browse by Category</h2>
          
          {loading ? (
            <div className="text-center py-12">
              <p className="text-neutral-500">Loading collections...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {collections.map((collection, index) => {
                const Icon = getCollectionIcon(collection.icon);
                const colorClass = getCollectionColor(index);
                
                return (
                  <Link
                    key={collection.id}
                    to={`/knowledge/collections/${collection.id}`}
                    className="group bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple transition-all duration-200"
                  >
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${colorClass} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    
                    <h3 className="text-lg font-semibold text-neutral-900 mb-2 group-hover:text-brand-purple transition-colors">
                      {collection.title}
                    </h3>
                    
                    {collection.description && (
                      <p className="text-sm text-neutral-600 mb-4 line-clamp-2">
                        {collection.description}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-500">
                        {collection.article_count || 0} article{collection.article_count !== 1 ? 's' : ''}
                      </span>
                      <span className="text-brand-purple group-hover:translate-x-1 transition-transform">
                        →
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Articles */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-neutral-900">Recent Articles</h2>
            <Link
              to="/knowledge/search"
              className="text-sm font-medium text-brand-purple hover:text-brand-navy transition-colors"
            >
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <p className="text-neutral-500">Loading articles...</p>
            </div>
          ) : recentArticles.length === 0 ? (
            <div className="bg-gradient-to-br from-brand-light/30 to-white rounded-lg border border-neutral-100 p-8 text-center">
              <p className="text-sm text-neutral-600">No articles available yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentArticles.map((article) => (
                <Link
                  key={article.id}
                  to={`/knowledge/articles/${article.id}`}
                  className="block bg-white rounded-lg border border-neutral-200 p-4 hover:border-brand-purple hover:shadow-sm transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-neutral-900 mb-1">
                        {article.title}
                      </h3>
                      {article.summary && (
                        <p className="text-sm text-neutral-600 line-clamp-2">
                          {article.summary}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                        <span className="flex items-center gap-1">
                          <ClockIcon className="h-4 w-4" />
                          {formatDate(article.created_at)}
                        </span>
                        {article.collection_title && (
                          <span className="px-2 py-0.5 bg-brand-light rounded text-brand-purple">
                            {article.collection_title}
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRightIcon className="h-5 w-5 text-neutral-400 ml-4 flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="bg-gradient-to-br from-brand-purple/10 to-brand-navy/10 rounded-xl p-6 border border-brand-purple/20">
          <h2 className="text-lg font-bold text-neutral-900 mb-3">Need Help?</h2>
          <p className="text-sm text-neutral-700 mb-4">
            Can't find what you're looking for? Ask our team a question and we'll get back to you as soon as possible.
          </p>
          <Link
            to="/knowledge/questions"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm font-medium"
          >
            Ask a Question
          </Link>
        </div>
      </div>
  );
}

