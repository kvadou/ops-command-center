import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate } from '../utils/formatters';
import {
  WrenchScrewdriverIcon,
  PlusIcon,
  FolderIcon,
  DocumentTextIcon,
  QuestionMarkCircleIcon,
  DocumentPlusIcon,
  PencilSquareIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

/**
 * KnowledgeHubAdminPage - Admin dashboard for content management
 * Main branch only - manage collections, articles, drafts, questions
 */
export default function KnowledgeHubAdminPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    collections: 0,
    articles: 0,
    drafts: 0,
    questions: 0,
  });
  const [recentDrafts, setRecentDrafts] = useState([]);
  const [openQuestions, setOpenQuestions] = useState([]);
  const [collections, setCollections] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch stats
      const [collectionsRes, articlesRes, draftsRes, questionsRes] = await Promise.all([
        fetch('/api/knowledge/collections'),
        fetch('/api/knowledge/articles'),
        fetch('/api/knowledge/drafts?status=pending'),
        fetch('/api/knowledge/questions?status=open'),
      ]);

      const collectionsData = await collectionsRes.json();
      const articlesData = await articlesRes.json();
      const draftsData = await draftsRes.json();
      const questionsData = await questionsRes.json();

      setStats({
        collections: collectionsData.collections?.length || 0,
        articles: articlesData.articles?.length || 0,
        drafts: draftsData.drafts?.length || 0,
        questions: questionsData.questions?.length || 0,
      });

      setCollections(collectionsData.collections || []);
      setArticles(articlesData.articles || []);
      setRecentDrafts((draftsData.drafts || []).slice(0, 5));
      setOpenQuestions((questionsData.questions || []).slice(0, 5));
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };



  return (
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-brand-purple to-brand-navy rounded-xl">
              <WrenchScrewdriverIcon className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 font-heading">
                Content Management
              </h1>
              <p className="text-neutral-600 mt-1">
                Manage collections, articles, and franchisee contributions
              </p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <div className="flex items-center gap-3">
              <FolderIcon className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold text-neutral-900">{stats.collections}</p>
                <p className="text-sm text-neutral-600">Collections</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <div className="flex items-center gap-3">
              <DocumentTextIcon className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold text-neutral-900">{stats.articles}</p>
                <p className="text-sm text-neutral-600">Articles</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <div className="flex items-center gap-3">
              <DocumentPlusIcon className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold text-neutral-900">{stats.drafts}</p>
                <p className="text-sm text-neutral-600">Pending Drafts</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <div className="flex items-center gap-3">
              <QuestionMarkCircleIcon className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-neutral-900">{stats.questions}</p>
                <p className="text-sm text-neutral-600">Open Questions</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-neutral-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              to="/knowledge/admin/articles/new"
              className="block bg-gradient-to-br from-brand-purple to-brand-navy text-white p-6 rounded-xl hover:shadow-lg transition-all"
            >
              <PlusIcon className="h-6 w-6 mb-2" />
              <p className="font-semibold mb-1">Create New Article</p>
              <p className="text-sm text-white/80">Start writing a new knowledge base article</p>
            </Link>

            <button className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl hover:shadow-lg transition-all text-left">
              <PlusIcon className="h-6 w-6 mb-2" />
              <p className="font-semibold mb-1">Create New Collection</p>
              <p className="text-sm text-white/80">Organize articles into a new category</p>
            </button>
          </div>
        </div>

        {/* Pending Drafts */}
        {recentDrafts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-neutral-900 mb-4">
              Pending Drafts ({stats.drafts})
            </h2>
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <div className="space-y-3">
                {recentDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg border border-neutral-200"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-neutral-900">{draft.title}</p>
                      <p className="text-xs text-neutral-500">
                        By {draft.proposed_by_name} • {formatDate(draft.created_at)}
                      </p>
                    </div>
                    <button className="px-3 py-1 bg-brand-purple text-white text-sm rounded hover:bg-brand-navy transition-colors">
                      Review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Open Questions */}
        {openQuestions.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-neutral-900 mb-4">
              Open Questions ({stats.questions})
            </h2>
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <div className="space-y-3">
                {openQuestions.map((question) => (
                  <div
                    key={question.id}
                    className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg border border-neutral-200"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-neutral-900">{question.subject}</p>
                      <p className="text-xs text-neutral-500">
                        From {question.user_name} • {formatDate(question.created_at)}
                      </p>
                    </div>
                    <Link
                      to="/knowledge/questions"
                      className="px-3 py-1 bg-brand-purple text-white text-sm rounded hover:bg-brand-navy transition-colors"
                    >
                      Answer
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* All Collections */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-neutral-900">
              All Collections ({stats.collections})
            </h2>
            <Link
              to="/knowledge/admin/collections/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white text-sm font-medium rounded-lg hover:bg-brand-navy transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              New Collection
            </Link>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            {collections.length > 0 ? (
              <div className="space-y-3">
                {collections.map((collection) => (
                  <div
                    key={collection.id}
                    className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg border border-neutral-200 hover:border-brand-purple transition-all"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <FolderIcon className="h-6 w-6 text-brand-purple" />
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">{collection.title}</p>
                        {collection.description && (
                          <p className="text-xs text-neutral-500">{collection.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/knowledge/collections/${collection.slug}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-200 rounded-md transition-colors"
                      >
                        <EyeIcon className="h-4 w-4" />
                        View
                      </Link>
                      <Link
                        to={`/knowledge/admin/collections/${collection.id}/edit`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-brand-purple hover:bg-brand-purple hover:text-white rounded-md transition-colors"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                        Edit
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500 text-center py-4">No collections yet</p>
            )}
          </div>
        </div>

        {/* All Articles */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-neutral-900 mb-4">
            All Articles ({stats.articles})
          </h2>
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            {articles.length > 0 ? (
              <div className="space-y-3">
                {articles.map((article) => (
                  <div
                    key={article.id}
                    className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg border border-neutral-200 hover:border-brand-purple transition-all"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-neutral-900">{article.title}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {article.collection_title && (
                          <span className="text-xs text-neutral-500">{article.collection_title}</span>
                        )}
                        <span className="text-xs text-neutral-400">
                          {article.is_published ? '✓ Published' : '○ Draft'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/knowledge/articles/${article.id}`}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200 rounded-md transition-colors"
                      >
                        View
                      </Link>
                      <Link
                        to={`/knowledge/admin/articles/${article.id}/edit`}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-brand-purple hover:bg-brand-purple hover:text-white rounded-md transition-colors"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                        Edit
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500 text-center py-4">No articles yet</p>
            )}
          </div>
        </div>

        {/* Placeholder message when no pending items */}
        {!loading && recentDrafts.length === 0 && openQuestions.length === 0 && (
          <div className="bg-gradient-to-br from-brand-light/30 to-white rounded-lg border border-neutral-100 p-8 text-center">
            <p className="text-sm text-neutral-600">
              No pending items. All caught up! 🎉
            </p>
          </div>
        )}
      </div>
  );
}

