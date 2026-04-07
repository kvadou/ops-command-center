import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircleIcon as CheckCircleOutline,
  ChevronDownIcon,
  ChevronRightIcon,
  SparklesIcon,
  RocketLaunchIcon,
  ArrowRightIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';

/**
 * FranchiseeProgressPage - Clean checklist view for franchisee onboarding
 * Shows all checklist items directly - no need to click through to articles
 */
export default function FranchiseeProgressPage() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [franchiseId, setFranchiseId] = useState('');
  const [totalItems, setTotalItems] = useState(0);
  const [completedItems, setCompletedItems] = useState(0);
  const [expandedSections, setExpandedSections] = useState({});
  const [togglingItem, setTogglingItem] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProgress();
  }, []);

  // Auto-expand sections that are not complete
  useEffect(() => {
    if (articles.length > 0) {
      const expanded = {};
      articles.forEach(article => {
        // Expand sections that are in progress (started but not complete)
        if (article.progress_percentage > 0 && article.progress_percentage < 100) {
          expanded[article.id] = true;
        }
        // Also expand first section if nothing is started
        if (articles.every(a => a.progress_percentage === 0)) {
          expanded[articles[0].id] = true;
        }
      });
      setExpandedSections(expanded);
    }
  }, [articles]);

  const fetchProgress = async () => {
    try {
      setLoading(true);
      const articlesResponse = await fetch('/api/knowledge/articles?published_only=true', {
        credentials: 'include',
      });
      
      if (!articlesResponse.ok) throw new Error('Failed to fetch articles');
      const articlesData = await articlesResponse.json();
      
      const articlesWithChecklists = [];
      let total = 0;
      let completed = 0;
      
      for (const article of articlesData.articles || []) {
        const checklistResponse = await fetch(`/api/knowledge/articles/${article.id}/checklist`, {
          credentials: 'include',
        });
        
        if (checklistResponse.ok) {
          const checklistData = await checklistResponse.json();
          
          if (checklistData.checklist_items && checklistData.checklist_items.length > 0) {
            const itemsCompleted = checklistData.checklist_items.filter(i => i.is_completed).length;
            const itemsTotal = checklistData.checklist_items.length;
            
            articlesWithChecklists.push({
              ...article,
              checklist_items: checklistData.checklist_items,
              completed_count: itemsCompleted,
              total_count: itemsTotal,
              progress_percentage: Math.round((itemsCompleted / itemsTotal) * 100),
            });
            
            total += itemsTotal;
            completed += itemsCompleted;
            
            if (!franchiseId && checklistData.franchise_id) {
              setFranchiseId(checklistData.franchise_id);
            }
          }
        }
      }
      
      setArticles(articlesWithChecklists);
      setTotalItems(total);
      setCompletedItems(completed);
    } catch (error) {
      console.error('Error fetching progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (articleId) => {
    setExpandedSections(prev => ({
      ...prev,
      [articleId]: !prev[articleId]
    }));
  };

  const toggleChecklistItem = async (articleId, itemId, currentStatus) => {
    setTogglingItem(itemId);
    try {
      const response = await fetch(`/api/knowledge/articles/${articleId}/checklist/${itemId}/toggle`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_completed: !currentStatus }),
      });
      
      if (response.ok) {
        // Update local state
        setArticles(prev => prev.map(article => {
          if (article.id === articleId) {
            const updatedItems = article.checklist_items.map(item => 
              item.id === itemId ? { ...item, is_completed: !currentStatus } : item
            );
            const newCompleted = updatedItems.filter(i => i.is_completed).length;
            return {
              ...article,
              checklist_items: updatedItems,
              completed_count: newCompleted,
              progress_percentage: Math.round((newCompleted / article.total_count) * 100),
            };
          }
          return article;
        }));
        
        // Update overall counts
        setCompletedItems(prev => currentStatus ? prev - 1 : prev + 1);
      }
    } catch (error) {
      console.error('Error toggling checklist item:', error);
    } finally {
      setTogglingItem(null);
    }
  };

  const overallProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  const getProgressColor = (percentage) => {
    if (percentage >= 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-blue-500';
    if (percentage >= 50) return 'bg-yellow-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-neutral-300';
  };

  const getStatusBadge = (percentage) => {
    if (percentage >= 100) return { text: 'Complete', color: 'bg-green-100 text-green-700', icon: '✓' };
    if (percentage >= 75) return { text: 'Almost Done', color: 'bg-blue-100 text-blue-700', icon: '🔵' };
    if (percentage >= 50) return { text: 'In Progress', color: 'bg-yellow-100 text-yellow-700', icon: '🟡' };
    if (percentage > 0) return { text: 'Started', color: 'bg-orange-100 text-orange-700', icon: '🟠' };
    return { text: 'Not Started', color: 'bg-neutral-100 text-neutral-600', icon: '○' };
  };

  return (
      <div className="max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-brand-purple rounded-lg">
              <RocketLaunchIcon className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900">Your Onboarding Progress</h1>
          </div>
          <p className="text-neutral-600">
            Complete the checklist items below to finish your onboarding.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
            <p className="text-neutral-500 mt-4">Loading your progress...</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
            <SparklesIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">No Checklists Yet</h3>
            <p className="text-neutral-600 mb-4">
              There are no onboarding checklists available yet. Check back soon!
            </p>
            <Link
              to="/knowledge"
              className="inline-flex items-center gap-2 text-brand-purple hover:text-brand-navy font-medium"
            >
              Browse Knowledge Hub
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            {/* Overall Progress Card */}
            <div className="bg-gradient-to-r from-brand-purple to-brand-navy rounded-xl p-6 mb-6 text-white">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold">Overall Progress</h2>
                  <p className="text-blue-100 text-sm">
                    {completedItems} of {totalItems} items completed
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold">{overallProgress}%</div>
                  {overallProgress === 100 && (
                    <span className="text-sm text-green-300">🎉 All done!</span>
                  )}
                </div>
              </div>
              
              <div className="bg-white/20 rounded-full h-3 overflow-hidden">
                <div 
                  className="h-full bg-green-400 rounded-full transition-all duration-500"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>

            {/* Checklist Sections */}
            <div className="space-y-3">
              {articles.map((article) => {
                const status = getStatusBadge(article.progress_percentage);
                const isExpanded = expandedSections[article.id];
                
                return (
                  <div 
                    key={article.id}
                    className="bg-white rounded-xl border border-neutral-200 overflow-hidden"
                  >
                    {/* Section Header - Clickable to expand/collapse */}
                    <button
                      onClick={() => toggleSection(article.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {isExpanded ? (
                          <ChevronDownIcon className="h-5 w-5 text-neutral-500 flex-shrink-0" />
                        ) : (
                          <ChevronRightIcon className="h-5 w-5 text-neutral-500 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-neutral-900 truncate">
                              {article.title}
                            </h3>
                            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${status.color}`}>
                              {status.text}
                            </span>
                          </div>
                          {article.summary && (
                            <p className="text-sm text-neutral-500 truncate mt-0.5">
                              {article.summary}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-neutral-200 rounded-full h-2 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${getProgressColor(article.progress_percentage)}`}
                              style={{ width: `${article.progress_percentage}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-neutral-600 w-10 text-right">
                            {article.completed_count}/{article.total_count}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Expanded Checklist Items */}
                    {isExpanded && (
                      <div className="border-t border-neutral-100 px-4 pb-4">
                        <div className="space-y-1 pt-3">
                          {article.checklist_items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => toggleChecklistItem(article.id, item.id, item.is_completed)}
                              disabled={togglingItem === item.id}
                              className={`w-full flex items-start gap-3 p-3 rounded-lg transition-all text-left ${
                                item.is_completed 
                                  ? 'bg-green-50 hover:bg-green-100' 
                                  : 'hover:bg-neutral-50'
                              } ${togglingItem === item.id ? 'opacity-50' : ''}`}
                            >
                              {item.is_completed ? (
                                <CheckCircleSolid className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                              ) : (
                                <CheckCircleOutline className="h-5 w-5 text-neutral-300 flex-shrink-0 mt-0.5" />
                              )}
                              <div className="flex-1">
                                <span className={`text-sm ${
                                  item.is_completed 
                                    ? 'text-neutral-500 line-through' 
                                    : 'text-neutral-900'
                                }`}>
                                  {item.title}
                                </span>
                                {item.description && (
                                  <p className={`text-xs mt-0.5 ${
                                    item.is_completed ? 'text-neutral-400' : 'text-neutral-500'
                                  }`}>
                                    {item.description}
                                  </p>
                                )}
                              </div>
                              {item.is_required && !item.is_completed && (
                                <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex-shrink-0">
                                  Required
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                        
                        {/* Link to full article for more details */}
                        <div className="mt-3 pt-3 border-t border-neutral-100">
                          <Link
                            to={`/knowledge/articles/${article.slug || article.id}`}
                            className="inline-flex items-center gap-2 text-sm text-brand-purple hover:text-brand-navy"
                          >
                            <DocumentTextIcon className="h-4 w-4" />
                            View full article for more details
                            <ArrowRightIcon className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Help Section */}
            <div className="mt-6 bg-blue-50 rounded-xl p-5 border border-blue-100">
              <h3 className="font-semibold text-blue-900 mb-1">Need Help?</h3>
              <p className="text-blue-700 text-sm mb-2">
                Questions about any onboarding steps? Reach out to your Acme Operations support team.
              </p>
              <Link
                to="/knowledge/questions"
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900"
              >
                Ask a Question
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </div>
  );
}
