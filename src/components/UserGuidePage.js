import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  MagnifyingGlassIcon,
  BookOpenIcon,
  ChevronRightIcon,
  PlayIcon,
  DocumentTextIcon,
  PhotoIcon,
  CodeBracketIcon,
} from "@heroicons/react/24/outline";

/**
 * UserGuidePage - Main user guide viewer
 * Displays collections and articles in a clean, searchable interface
 */
export default function UserGuidePage() {
  const { collectionId, articleId } = useParams();
  const navigate = useNavigate();
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [sections, setSections] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCollections();
  }, []);

  useEffect(() => {
    if (collectionId) {
      fetchCollection(collectionId);
    }
  }, [collectionId]);

  useEffect(() => {
    if (articleId) {
      fetchArticle(articleId);
    }
  }, [articleId]);

  const fetchCollections = async () => {
    try {
      const response = await fetch("/api/user-guide/collections?published_only=true");
      const data = await response.json();
      setCollections(data.collections || []);
      
      // If collectionId is in URL, select it
      if (collectionId && data.collections) {
        const collection = data.collections.find(c => c.id === parseInt(collectionId));
        if (collection) {
          setSelectedCollection(collection);
        }
      }
    } catch (error) {
      console.error("Error fetching collections:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCollection = async (id) => {
    try {
      const response = await fetch(`/api/user-guide/collections/${id}`);
      const data = await response.json();
      setSelectedCollection({ ...data.collection, articles: data.articles || [] });
      
      // If articleId is in URL, select it
      if (articleId && data.articles) {
        const article = data.articles.find(a => a.id === parseInt(articleId));
        if (article) {
          setSelectedArticle(article);
          fetchArticle(article.id);
        }
      }
    } catch (error) {
      console.error("Error fetching collection:", error);
    }
  };

  const fetchArticle = async (id) => {
    try {
      const response = await fetch(`/api/user-guide/articles/${id}`);
      const data = await response.json();
      setSelectedArticle(data.article);
      setSections(data.sections || []);
    } catch (error) {
      console.error("Error fetching article:", error);
    }
  };

  const handleCollectionClick = (collection) => {
    setSelectedCollection(collection);
    setSelectedArticle(null);
    setSections([]);
    navigate(`/user-guide/collections/${collection.id}`);
  };

  const handleArticleClick = (article) => {
    setSelectedArticle(article);
    navigate(`/user-guide/collections/${selectedCollection.id}/articles/${article.id}`);
    fetchArticle(article.id);
  };

  const filteredCollections = collections.filter((collection) =>
    collection.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    collection.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderVideoEmbed = (videoUrl, provider) => {
    if (!videoUrl) return null;

    // Extract Loom video ID
    if (provider === "loom" || videoUrl.includes("loom.com")) {
      const loomMatch = videoUrl.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
      if (loomMatch) {
        const videoId = loomMatch[1];
        return (
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              src={`https://www.loom.com/embed/${videoId}`}
              frameBorder="0"
              allowFullScreen
              className="absolute top-0 left-0 w-full h-full rounded-lg"
            />
          </div>
        );
      }
    }

    // YouTube embed
    if (provider === "youtube" || videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
      const youtubeMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
      if (youtubeMatch) {
        const videoId = youtubeMatch[1];
        return (
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              frameBorder="0"
              allowFullScreen
              className="absolute top-0 left-0 w-full h-full rounded-lg"
            />
          </div>
        );
      }
    }

    // Vimeo embed
    if (provider === "vimeo" || videoUrl.includes("vimeo.com")) {
      const vimeoMatch = videoUrl.match(/vimeo\.com\/(\d+)/);
      if (vimeoMatch) {
        const videoId = vimeoMatch[1];
        return (
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              src={`https://player.vimeo.com/video/${videoId}`}
              frameBorder="0"
              allowFullScreen
              className="absolute top-0 left-0 w-full h-full rounded-lg"
            />
          </div>
        );
      }
    }

    // Fallback: try to embed as-is
    return (
      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
        <iframe
          src={videoUrl}
          frameBorder="0"
          allowFullScreen
          className="absolute top-0 left-0 w-full h-full rounded-lg"
        />
      </div>
    );
  };

  const renderSection = (section) => {
    switch (section.section_type) {
      case "video":
        return (
          <div key={section.id} className="mb-8">
            {section.title && (
              <h3 className="text-xl font-semibold text-neutral-900 mb-4">{section.title}</h3>
            )}
            {renderVideoEmbed(section.video_url, section.video_provider)}
          </div>
        );
      case "image":
        return (
          <div key={section.id} className="mb-8">
            {section.title && (
              <h3 className="text-xl font-semibold text-neutral-900 mb-4">{section.title}</h3>
            )}
            {section.image_url && (
              <img
                src={section.image_url}
                alt={section.title || "Guide image"}
                className="w-full rounded-lg shadow-md"
              />
            )}
          </div>
        );
      case "code":
        return (
          <div key={section.id} className="mb-8">
            {section.title && (
              <h3 className="text-xl font-semibold text-neutral-900 mb-4">{section.title}</h3>
            )}
            <pre className="bg-neutral-900 text-neutral-100 p-4 rounded-lg overflow-x-auto">
              <code className={`language-${section.code_language || "text"}`}>
                {section.code_content}
              </code>
            </pre>
          </div>
        );
      default:
        return (
          <div key={section.id} className="mb-8">
            {section.title && (
              <h3 className="text-xl font-semibold text-neutral-900 mb-4">{section.title}</h3>
            )}
            {section.content && (
              <div
                className="prose prose-lg max-w-none text-neutral-700"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(section.content) }}
              />
            )}
          </div>
        );
    }
  };

  return (
      <div className="max-w-7xl mx-auto w-full">
        {/* Search Bar Section */}
        <div className="bg-white border-b border-neutral-200 mb-6">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="max-w-2xl mx-auto">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search for articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                />
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple"></div>
          </div>
        ) : selectedArticle ? (
          /* Article View */
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 lg:p-8">
            {/* Breadcrumbs */}
            <nav className="mb-6 text-sm text-neutral-500">
              <Link to="/user-guide" className="hover:text-brand-purple">
                All Collections
              </Link>
              <ChevronRightIcon className="inline h-4 w-4 mx-2" />
              <Link
                to={`/user-guide/collections/${selectedCollection.id}`}
                className="hover:text-brand-purple"
              >
                {selectedCollection.title}
              </Link>
              <ChevronRightIcon className="inline h-4 w-4 mx-2" />
              <span className="text-neutral-900">{selectedArticle.title}</span>
            </nav>

            {/* Article Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-neutral-900 mb-3">{selectedArticle.title}</h1>
              {selectedArticle.description && (
                <p className="text-lg text-neutral-600">{selectedArticle.description}</p>
              )}
            </div>

            {/* Article Content */}
            <div className="space-y-6">
              {sections.map(renderSection)}
            </div>
          </div>
        ) : selectedCollection ? (
          /* Collection View */
          <div>
            {/* Breadcrumbs */}
            <nav className="mb-6 text-sm text-neutral-500">
              <Link to="/user-guide" className="hover:text-brand-purple">
                All Collections
              </Link>
              <ChevronRightIcon className="inline h-4 w-4 mx-2" />
              <span className="text-neutral-900">{selectedCollection.title}</span>
            </nav>

            {/* Collection Header */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-6">
              <div className="flex items-start gap-4">
                <BookOpenIcon className="h-8 w-8 text-brand-purple flex-shrink-0 mt-1" />
                <div>
                  <h1 className="text-3xl font-bold text-neutral-900 mb-2">
                    {selectedCollection.title}
                  </h1>
                  {selectedCollection.description && (
                    <p className="text-lg text-neutral-600">{selectedCollection.description}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Articles List */}
            <div className="space-y-4">
              {selectedCollection.articles && selectedCollection.articles.length > 0 ? (
                selectedCollection.articles.map((article) => (
                  <div
                    key={article.id}
                    onClick={() => handleArticleClick(article)}
                    className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200 cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                          {article.title}
                        </h3>
                        {article.description && (
                          <p className="text-sm text-neutral-600">{article.description}</p>
                        )}
                      </div>
                      <ChevronRightIcon className="h-5 w-5 text-neutral-400 ml-4" />
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 text-center text-neutral-500">
                  No articles in this collection yet.
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Collections Grid View */
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-neutral-900 mb-2">
                Advice and answers from the Acme Operations Team
              </h1>
              <p className="text-neutral-600">
                Browse our user guide to learn how to use the Acme Operations Operations Hub.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCollections.map((collection) => (
                <div
                  key={collection.id}
                  onClick={() => handleCollectionClick(collection)}
                  className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200 cursor-pointer"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <BookOpenIcon className="h-8 w-8 text-brand-purple flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                        {collection.title}
                      </h3>
                      {collection.description && (
                        <p className="text-sm text-neutral-600 line-clamp-3">
                          {collection.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center text-sm text-brand-purple">
                    <span>View collection</span>
                    <ChevronRightIcon className="h-4 w-4 ml-2" />
                  </div>
                </div>
              ))}
            </div>

            {filteredCollections.length === 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
                <p className="text-neutral-500">No collections found matching your search.</p>
              </div>
            )}
          </div>
        )}
      </div>
  );
}
