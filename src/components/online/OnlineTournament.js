import React, { useState, useEffect } from 'react';
import { useToast } from '../../hooks/useToast';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';
import {
  TrophyIcon,
  CalendarIcon,
  UserGroupIcon,
  ChartBarIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import {
  Button,
  CircularProgress,
  Chip,
} from '@mui/material';

export default function OnlineTournament() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState([]);

  useEffect(() => {
    // Fetch tournaments
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    try {
      setLoading(true);
      // TODO: Replace with actual API endpoint when available
      // For now, using a placeholder
      // Placeholder - replace with actual API call
      // const response = await fetch('/api/online/tournaments', { headers });
      // if (response.ok) {
      //   const data = await response.json();
      //   setTournaments(data.tournaments || []);
      // }
      
      // Temporary placeholder data
      setTournaments([]);
    } catch (error) {
      console.error('Error fetching tournaments:', error);
      setTournaments([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <RoleProvider>
      <BranchProvider>
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <div>
                <h1 className="text-2xl font-bold text-neutral-900">Online Tournaments</h1>
                <p className="text-sm text-neutral-600 mt-1">
                  Manage and track online chess tournaments
                </p>
              </div>
              <button
                onClick={() => {
                  // TODO: Open create tournament dialog
                  toast.info('Create tournament functionality coming soon');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors duration-200 font-medium"
              >
                <PlusIcon className="h-5 w-5" />
                Create Tournament
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <CircularProgress />
                <span className="ml-3 text-neutral-600">Loading tournaments...</span>
              </div>
            ) : tournaments.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
                <TrophyIcon className="h-16 w-16 text-neutral-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                  No Tournaments Found
                </h3>
                <p className="text-sm text-neutral-600 mb-6">
                  Get started by creating your first online tournament.
                </p>
                <button
                  onClick={() => {
                    // TODO: Open create tournament dialog
                    toast.info('Create tournament functionality coming soon');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors duration-200 font-medium"
                >
                  <PlusIcon className="h-5 w-5" />
                  Create Tournament
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tournaments.map((tournament) => (
                  <div
                    key={tournament.id}
                    className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-neutral-900 mb-1">
                          {tournament.name}
                        </h3>
                        {tournament.description && (
                          <p className="text-sm text-neutral-600 line-clamp-2">
                            {tournament.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Tournament Details */}
                    <div className="space-y-3 mb-4">
                      {tournament.date && (
                        <div className="flex items-center gap-2 text-sm">
                          <CalendarIcon className="h-4 w-4 text-neutral-400" />
                          <span className="text-neutral-600">{tournament.date}</span>
                        </div>
                      )}
                      {tournament.participants !== undefined && (
                        <div className="flex items-center gap-2 text-sm">
                          <UserGroupIcon className="h-4 w-4 text-neutral-400" />
                          <span className="text-neutral-600">{tournament.participants} participants</span>
                        </div>
                      )}
                      {tournament.status && (
                        <Chip
                          label={tournament.status}
                          size="small"
                          sx={{
                            height: 24,
                            fontSize: '0.7rem',
                            bgcolor: tournament.status === 'Active' ? '#34B256' : '#6A469D',
                            color: 'white',
                          }}
                        />
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-4 border-t border-neutral-200">
                      <button className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors duration-200 text-sm font-medium">
                        <ChartBarIcon className="h-4 w-4" />
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
      </BranchProvider>
    </RoleProvider>
  );
}









