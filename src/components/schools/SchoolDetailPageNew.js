import React, { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import EntityDetailPage from '../EntityDetailPage';
import NotFound from '../NotFound';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';
import SchoolOverviewTab from './tabs/SchoolOverviewTab';
import SchoolScheduleTab from './tabs/SchoolScheduleTab';
import SchoolStudentsTab from './tabs/SchoolStudentsTab';
import SchoolBillingTab from './tabs/SchoolBillingTab';
import SchoolCommunicationsTab from './tabs/SchoolCommunicationsTab';
import SchoolActivityTab from './tabs/SchoolActivityTab';
import SchoolRequirementsTab from './tabs/SchoolRequirementsTab';
import {
  BuildingOffice2Icon,
  BriefcaseIcon,
  UsersIcon,
  CurrencyDollarIcon,
  EnvelopeIcon,
  ClockIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

export default function SchoolDetailPageNew() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');

  useEffect(() => {
    fetchSchoolData();
  }, [id]);

  useEffect(() => {
    // Update URL when tab changes
    const newParams = new URLSearchParams(searchParams);
    if (activeTab && activeTab !== 'overview') {
      newParams.set('tab', activeTab);
    } else {
      newParams.delete('tab');
    }
    setSearchParams(newParams, { replace: true });
  }, [activeTab]);

  useEffect(() => {
    // Sync tab from URL on load
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, []);

  const fetchSchoolData = async () => {
    try {
      setLoading(true);
      // Fetch from the entity-lists schools endpoint
      const response = await fetch(`/api/entity-lists/schools/${id}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 404) {
          setError('not-found');
          return;
        }
        throw new Error('Failed to fetch school details');
      }

      const schoolData = await response.json();
      setData(schoolData);
    } catch (err) {
      console.error('Error fetching school:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple"></div>
        </div>
      </div>
    );
  }

  if (error === 'not-found') {
    return <NotFound message="School not found" backUrl="/school-partners" backLabel="Schools" />;
  }

  if (error) {
    return (
      <div className="w-full p-4 sm:p-6 lg:p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600">Error: {error}</p>
          <Link to="/schools" className="mt-4 text-brand-purple hover:underline">
            Back to Schools
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return <NotFound message="School not found" backUrl="/school-partners" backLabel="Schools" />;
  }

  const school = data;

  // Build TutorCruncher URL
  const tutorCruncherUrl = school.clientId && !school.clientId.startsWith('SCHOOL_')
    ? `https://account.acmeops.com/clients/${school.clientId}/`
    : null;

  const tabs = [
    { id: 'overview', name: 'Overview', icon: BuildingOffice2Icon },
    { id: 'schedule', name: 'Jobs', icon: BriefcaseIcon },
    { id: 'students', name: 'Students', icon: UsersIcon },
    { id: 'billing', name: 'Billing', icon: CurrencyDollarIcon },
    { id: 'communications', name: 'Communications', icon: EnvelopeIcon },
    { id: 'requirements', name: 'Requirements', icon: ShieldCheckIcon },
    { id: 'activity', name: 'Activity', icon: ClockIcon }
  ];

  const getHealthColor = (status) => {
    switch (status) {
      case 'healthy': return 'green';
      case 'needs_attention': return 'yellow';
      case 'unhealthy': return 'red';
      default: return 'gray';
    }
  };

  return (
    <RoleProvider>
      <BranchProvider>
        <div className="w-full p-4 sm:p-6 lg:p-8">
          <EntityDetailPage
            title={`School: ${school.name}`}
            status={school.healthStatus}
            statusColor={getHealthColor(school.healthStatus)}
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tutorCruncherUrl={tutorCruncherUrl}
            backToListUrl="/school-partners"
            backToListLabel="Schools"
          >
            {activeTab === 'overview' && (
              <SchoolOverviewTab school={school} onRefresh={fetchSchoolData} />
            )}

            {activeTab === 'schedule' && (
              <SchoolScheduleTab school={school} />
            )}

            {activeTab === 'students' && (
              <SchoolStudentsTab school={school} />
            )}

            {activeTab === 'billing' && (
              <SchoolBillingTab school={school} />
            )}

            {activeTab === 'communications' && (
              <SchoolCommunicationsTab school={school} />
            )}

            {activeTab === 'requirements' && (
              <SchoolRequirementsTab school={school} />
            )}

            {activeTab === 'activity' && (
              <SchoolActivityTab school={school} />
            )}
          </EntityDetailPage>
        </div>
      </BranchProvider>
    </RoleProvider>
  );
}
