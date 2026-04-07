import React, { useState, useEffect, useCallback } from 'react';
import { XMarkIcon, MagnifyingGlassIcon, CheckIcon, UserIcon } from '@heroicons/react/24/outline';

export default function MatchModal({ referralId, onClose, onMatched }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  // Load auto-suggestions on mount
  useEffect(() => {
    async function loadSuggestions() {
      try {
        const res = await fetch(`/api/referrals/${referralId}`, { credentials: 'include' });
        const data = await res.json();
        const ref = data.referral;
        if (!ref) return;

        const params = new URLSearchParams();
        if (ref.referred_email) params.set('email', ref.referred_email);
        if (ref.referred_phone) params.set('phone', ref.referred_phone);
        if (ref.referred_name) params.set('name', ref.referred_name);

        const sugRes = await fetch(`/api/referrals/suggestions?${params}`, { credentials: 'include' });
        const sugData = await sugRes.json();
        setSuggestions(sugData.suggestions || []);
      } catch {
        // non-critical
      }
    }
    loadSuggestions();
  }, [referralId]);

  const searchClients = useCallback(async (query) => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch('/api/crm/clients/search', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, pagination: { page: 1, limit: 10 } }),
      });
      const data = await res.json();
      setResults(data.clients || data.rows || data || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => searchClients(search), 300);
    return () => clearTimeout(timer);
  }, [search, searchClients]);

  async function handleMatch(clientId, clientName) {
    setSaving(true);
    try {
      const res = await fetch(`/api/referrals/${referralId}/match`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matched_client_id: clientId, matched_client_name: clientName }),
      });
      if (res.ok) {
        onMatched();
      }
    } catch (err) {
      console.error('Failed to match referral', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">Match to Client</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Auto-suggestions */}
          {suggestions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                Suggested Matches
              </h3>
              <div className="space-y-1.5">
                {suggestions.map(s => (
                  <button
                    key={`sug-${s.id}`}
                    onClick={() => handleMatch(s.client_id || s.id, s.referred_name)}
                    disabled={saving}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-brand-green/30 bg-brand-green/5 hover:bg-brand-green/10 transition-colors text-left disabled:opacity-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{s.referred_name}</p>
                      <p className="text-xs text-neutral-500">
                        {s.match_type} match &middot; {s.confidence} confidence
                      </p>
                    </div>
                    <CheckIcon className="h-4 w-4 text-brand-green shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Client search */}
          <div>
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
              Search Clients
            </h3>
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple/50 focus:border-brand-purple outline-none transition-colors"
              />
            </div>
          </div>

          {/* Search results */}
          {searching && (
            <div className="text-center py-4 text-sm text-neutral-500">Searching...</div>
          )}
          {!searching && results.length > 0 && (
            <div className="space-y-1.5">
              {results.map(client => {
                const clientId = client.client_id || client.id;
                const clientName = [client.first_name, client.last_name].filter(Boolean).join(' ') || client.name || `Client #${clientId}`;
                return (
                  <button
                    key={clientId}
                    onClick={() => handleMatch(String(clientId), clientName)}
                    disabled={saving}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors text-left disabled:opacity-50"
                  >
                    <UserIcon className="h-5 w-5 text-neutral-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-neutral-900 truncate">{clientName}</p>
                      <p className="text-xs text-neutral-500 truncate">
                        {client.email || ''} {client.phone ? `\u00B7 ${client.phone}` : ''}
                      </p>
                    </div>
                    <CheckIcon className="h-4 w-4 text-neutral-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
          {!searching && search.length >= 2 && results.length === 0 && (
            <p className="text-sm text-neutral-500 text-center py-4">No clients found</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-neutral-600 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
