import { Link, useLocation, useParams } from 'react-router-dom';
import {
  BookOpenIcon,
  Squares2X2Icon,
  UsersIcon,
  AcademicCapIcon,
  EnvelopeIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { useState, useEffect } from 'react';

const iconMap = {
  Squares2X2Icon,
  UsersIcon,
  AcademicCapIcon,
  EnvelopeIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  Cog6ToothIcon,
};

export default function UserGuideSidebar() {
  const location = useLocation();
  const { collectionId, articleId } = useParams();
  const [collections, setCollections] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCollections();
  }, []);

  useEffect(() => {
    if (collectionId) {
      fetchArticles(collectionId);
    }
  }, [collectionId]);

  const fetchCollections = async () => {
    try {
      const response = await fetch('/api/user-guide/collections');
      if (response.ok) {
        const data = await response.json();
        setCollections(data.collections || []);
      }
    } catch (error) {
      console.error('Error fetching collections:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchArticles = async (id) => {
    try {
      const response = await fetch(`/api/user-guide/collections/${id}/articles`);
      if (response.ok) {
        const data = await response.json();
        setArticles(data.articles || []);
      }
    } catch (error) {
      console.error('Error fetching articles:', error);
    }
  };

  const isActive = (path) => {
    return location.pathname === path;
  };

  const isCollectionActive = (id) => {
    return location.pathname === `/user-guide/collections/${id}` || 
           (collectionId && parseInt(collectionId) === id);
  };

  const isArticleActive = (id) => {
    return articleId && parseInt(articleId) === id;
  };

  if (loading) {
    return (
      <aside className="h-full bg-white border-r border-neutral-200 px-0 py-4">
        <div className="px-4 py-2">
          <div className="animate-pulse">
            <div className="h-4 bg-neutral-200 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-neutral-200 rounded w-1/2"></div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="h-full bg-white border-r border-neutral-200 px-0 py-4 space-y-6 overflow-y-auto">
      {/* Collections Section */}
      <div>
        <h3 className="px-4 pr-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
          Collections
        </h3>
        <nav className="space-y-1">
          {collections
            .filter((c) => c.is_published)
            .map((collection) => {
              const Icon = iconMap[collection.icon] || BookOpenIcon;
              const active = isCollectionActive(collection.id);
              
              return (
                <div key={collection.id}>
                  <Link
                    to={`/user-guide/collections/${collection.id}`}
                    className={`
                      flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 relative overflow-hidden
                      ${active 
                        ? "text-white shadow-lg" 
                        : "text-neutral-700 hover:bg-brand-light/30 hover:text-brand-navy"
                      }
                    `}
                  >
                    {/* Active state gradient */}
                    {active && (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-r from-brand-navy via-brand-purple to-brand-navy opacity-90" />
                        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" />
                      </>
                    )}
                    <Icon className={`h-5 w-5 mr-3 relative z-10 ${active ? "text-white" : "text-brand-purple"}`} />
                    <span className="relative z-10 truncate">{collection.title}</span>
                  </Link>
                  
                  {/* Articles for active collection */}
                  {active && articles.length > 0 && (
                    <div className="ml-4 mt-1 space-y-1">
                      {articles
                        .filter((a) => a.is_published)
                        .map((article) => {
                          const articleActive = isArticleActive(article.id);
                          return (
                            <Link
                              key={article.id}
                              to={`/user-guide/collections/${collection.id}/articles/${article.id}`}
                              className={`
                                flex items-center px-3 py-1.5 text-sm rounded-lg transition-all duration-200
                                ${articleActive
                                  ? "bg-brand-purple/20 text-brand-navy font-medium"
                                  : "text-neutral-600 hover:bg-neutral-100"
                                }
                              `}
                            >
                              <span className="truncate">{article.title}</span>
                            </Link>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
        </nav>
      </div>
    </aside>
  );
}

