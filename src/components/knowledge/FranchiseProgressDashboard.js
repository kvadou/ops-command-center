import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCompanyName } from '../../contexts/CompanyNameContext';
import {
  BuildingOffice2Icon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  CalendarIcon,
  UserIcon,
  EnvelopeIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';

import { formatDate } from '../../utils/formatters';
/**
 * FranchiseProgressDashboard - HQ view of all franchise onboarding progress
 * Shows summary cards and detailed progress for each franchise
 */
export default function FranchiseProgressDashboard() {
  const { companyName, isMainBranch } = useCompanyName();
  const [franchises, setFranchises] = useState([]);
  const [selectedFranchise, setSelectedFranchise] = useState(null);
  const [franchiseDetail, setFranchiseDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchFranchiseProgress();
  }, []);

  useEffect(() => {
    if (selectedFranchise) {
      fetchFranchiseDetail(selectedFranchise);
    } else {
      setFranchiseDetail(null);
    }
  }, [selectedFranchise]);

  const fetchFranchiseProgress = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/knowledge/franchise-progress', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setFranchises(data.franchises || []);
      }
    } catch (error) {
      console.error('Error fetching franchise progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFranchiseDetail = async (franchiseId) => {
    try {
      setDetailLoading(true);
      const response = await fetch(`/api/knowledge/franchise-progress/${franchiseId}`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setFranchiseDetail(data);
      }
    } catch (error) {
      console.error('Error fetching franchise detail:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const getStatusColor = (percentage) => {
    if (percentage >= 100) return 'text-green-600 bg-green-100';
    if (percentage >= 75) return 'text-blue-600 bg-blue-100';
    if (percentage >= 50) return 'text-yellow-600 bg-yellow-100';
    if (percentage >= 25) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  const getProgressBarColor = (percentage) => {
    if (percentage >= 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-blue-500';
    if (percentage >= 50) return 'bg-yellow-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };


  if (!isMainBranch) {
    return (
        <div className="max-w-7xl mx-auto w-full text-center py-12">
          <ExclamationTriangleIcon className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Access Restricted</h2>
          <p className="text-neutral-600">
            This dashboard is only available to HQ administrators.
          </p>
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
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-3">
                <ChartBarIcon className="h-8 w-8 text-brand-purple" />
                Franchise Onboarding Progress
              </h1>
              <p className="text-neutral-600 mt-1">
                Monitor onboarding checklist completion for all franchisees
              </p>
            </div>
            <button
              onClick={fetchFranchiseProgress}
              className="flex items-center gap-2 px-4 py-2 text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
            <p className="text-neutral-500 mt-4">Loading franchise data...</p>
          </div>
        ) : franchises.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
            <BuildingOffice2Icon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">No Franchise Data</h3>
            <p className="text-neutral-600">
              No franchises are currently being tracked. Add checklist items to articles 
              to start tracking franchisee progress.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Franchise List */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
                  <h2 className="font-semibold text-neutral-900">Franchisees</h2>
                </div>
                <div className="divide-y divide-neutral-100">
                  {franchises.map((franchise) => (
                    <button
                      key={franchise.franchise_id}
                      onClick={() => setSelectedFranchise(franchise.franchise_id)}
                      className={`w-full p-4 text-left hover:bg-neutral-50 transition-colors ${
                        selectedFranchise === franchise.franchise_id ? 'bg-brand-purple/5 border-l-4 border-brand-purple' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <BuildingOffice2Icon className="h-5 w-5 text-brand-purple flex-shrink-0" />
                            <span className="font-medium text-neutral-900 truncate">
                              {franchise.franchise_name || franchise.franchise_id}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 bg-neutral-200 rounded-full h-2">
                              <div
                                className={`h-full rounded-full transition-all ${getProgressBarColor(franchise.completion_percentage || 0)}`}
                                style={{ width: `${franchise.completion_percentage || 0}%` }}
                              />
                            </div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getStatusColor(franchise.completion_percentage || 0)}`}>
                              {franchise.completion_percentage || 0}%
                            </span>
                          </div>
                          <p className="text-xs text-neutral-500 mt-1">
                            {franchise.completed_items || 0} of {franchise.total_items || 0} items
                          </p>
                        </div>
                        <ChevronRightIcon className="h-5 w-5 text-neutral-400 flex-shrink-0 ml-2" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Franchise Detail */}
            <div className="lg:col-span-2">
              {selectedFranchise ? (
                detailLoading ? (
                  <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple mx-auto"></div>
                    <p className="text-neutral-500 mt-4">Loading details...</p>
                  </div>
                ) : franchiseDetail ? (
                  <div className="space-y-6">
                    {/* Franchise Info Card */}
                    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                      <div className="bg-gradient-to-r from-brand-purple to-brand-navy px-6 py-4">
                        <h2 className="text-xl font-semibold text-white">
                          {franchiseDetail.franchise.franchise_name}
                        </h2>
                        <div className="flex items-center gap-4 mt-2 text-blue-100 text-sm">
                          {franchiseDetail.franchise.owner_name && (
                            <span className="flex items-center gap-1">
                              <UserIcon className="h-4 w-4" />
                              {franchiseDetail.franchise.owner_name}
                            </span>
                          )}
                          {franchiseDetail.franchise.owner_email && (
                            <span className="flex items-center gap-1">
                              <EnvelopeIcon className="h-4 w-4" />
                              {franchiseDetail.franchise.owner_email}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="p-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center p-3 bg-neutral-50 rounded-lg">
                            <div className="text-2xl font-bold text-brand-purple">
                              {Math.round((franchiseDetail.completed_items / franchiseDetail.total_items) * 100) || 0}%
                            </div>
                            <div className="text-xs text-neutral-500">Complete</div>
                          </div>
                          <div className="text-center p-3 bg-neutral-50 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">
                              {franchiseDetail.completed_items}
                            </div>
                            <div className="text-xs text-neutral-500">Completed</div>
                          </div>
                          <div className="text-center p-3 bg-neutral-50 rounded-lg">
                            <div className="text-2xl font-bold text-neutral-600">
                              {franchiseDetail.total_items - franchiseDetail.completed_items}
                            </div>
                            <div className="text-xs text-neutral-500">Remaining</div>
                          </div>
                          <div className="text-center p-3 bg-neutral-50 rounded-lg">
                            <div className="text-sm font-medium text-neutral-700">
                              {formatDate(franchiseDetail.franchise.start_date)}
                            </div>
                            <div className="text-xs text-neutral-500">Start Date</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Progress by Article */}
                    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                      <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
                        <h3 className="font-semibold text-neutral-900">Progress by Section</h3>
                      </div>
                      <div className="divide-y divide-neutral-100">
                        {franchiseDetail.progress_by_article.map((article) => (
                          <div key={article.article_id} className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <Link
                                  to={`/knowledge/articles/${article.article_slug}`}
                                  className="font-medium text-neutral-900 hover:text-brand-purple"
                                >
                                  {article.article_title}
                                </Link>
                                {article.collection_title && (
                                  <p className="text-xs text-neutral-500">{article.collection_title}</p>
                                )}
                              </div>
                              <span className={`text-sm font-medium px-2.5 py-1 rounded-full ${
                                getStatusColor(Math.round((article.completed_count / article.total_count) * 100))
                              }`}>
                                {article.completed_count}/{article.total_count}
                              </span>
                            </div>
                            
                            {/* Progress Bar */}
                            <div className="bg-neutral-200 rounded-full h-2 mb-3">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  getProgressBarColor(Math.round((article.completed_count / article.total_count) * 100))
                                }`}
                                style={{ width: `${(article.completed_count / article.total_count) * 100}%` }}
                              />
                            </div>

                            {/* Individual Items */}
                            <div className="space-y-2">
                              {article.items.map((item) => (
                                <div
                                  key={item.id}
                                  className={`flex items-center gap-3 p-2 rounded ${
                                    item.is_completed ? 'bg-green-50' : 'bg-neutral-50'
                                  }`}
                                >
                                  {item.is_completed ? (
                                    <CheckCircleSolid className="h-5 w-5 text-green-500 flex-shrink-0" />
                                  ) : (
                                    <div className="h-5 w-5 rounded-full border-2 border-neutral-300 flex-shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <span className={`text-sm ${
                                      item.is_completed ? 'text-neutral-500 line-through' : 'text-neutral-700'
                                    }`}>
                                      {item.title}
                                    </span>
                                    {item.is_completed && item.completed_at && (
                                      <span className="text-xs text-neutral-400 ml-2">
                                        {formatDate(item.completed_at)}
                                      </span>
                                    )}
                                  </div>
                                  {item.is_required && !item.is_completed && (
                                    <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded flex-shrink-0">
                                      Required
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null
              ) : (
                <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
                  <BuildingOffice2Icon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">Select a Franchise</h3>
                  <p className="text-neutral-600">
                    Click on a franchise from the list to view their detailed progress.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
  );
}

