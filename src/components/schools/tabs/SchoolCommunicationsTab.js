import React, { useState, useEffect } from 'react';
import {
  EnvelopeIcon,
  UserIcon,
  PhoneIcon,
  PlusIcon,
  PaperAirplaneIcon,
  CalendarDaysIcon,
  PencilIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { formatDate } from '../../../utils/formatters';

export default function SchoolCommunicationsTab({ school }) {
  const [contacts, setContacts] = useState([]);
  const [campaigns, setCampaigns] = useState(school.campaigns || []);
  const [activeSubTab, setActiveSubTab] = useState('contacts');
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', role: '' });
  const [editingContactId, setEditingContactId] = useState(null);
  const [editContactData, setEditContactData] = useState({ name: '', email: '', phone: '', role: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch contacts on mount
  useEffect(() => {
    fetchContacts();
  }, [school.clientId]);

  const fetchContacts = async () => {
    try {
      const response = await fetch(`/api/school-term-tracking/contacts/${school.clientId}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setContacts(data);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  };


  const handleAddContact = async () => {
    if (!newContact.name || !newContact.email) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/school-term-tracking/contacts/${school.clientId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(newContact)
      });

      if (response.ok) {
        const addedContact = await response.json();
        setContacts([...contacts, addedContact]);
        setNewContact({ name: '', email: '', phone: '', role: '' });
        setAddingContact(false);
      }
    } catch (error) {
      console.error('Error adding contact:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleEditContact = async (contactId) => {
    if (!editContactData.name || !editContactData.email) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/school-term-tracking/contacts/${contactId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(editContactData)
      });

      if (response.ok) {
        const updatedContact = await response.json();
        setContacts(contacts.map(c => c.id === contactId ? updatedContact : c));
        setEditingContactId(null);
        setEditContactData({ name: '', email: '', phone: '', role: '' });
      }
    } catch (error) {
      console.error('Error updating contact:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async (contactId) => {
    try {
      const response = await fetch(`/api/school-term-tracking/contacts/${contactId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        setContacts(contacts.filter(c => c.id !== contactId));
        setConfirmDeleteId(null);
      }
    } catch (error) {
      console.error('Error deleting contact:', error);
    }
  };

  const startEditingContact = (contact) => {
    setEditingContactId(contact.id);
    setEditContactData({
      name: contact.name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      role: contact.role || ''
    });
    setConfirmDeleteId(null);
  };

  const cancelEditingContact = () => {
    setEditingContactId(null);
    setEditContactData({ name: '', email: '', phone: '', role: '' });
  };

  const subTabs = [
    { id: 'contacts', label: 'Contacts', count: contacts.length },
    { id: 'campaigns', label: 'Email Campaigns', count: campaigns.length }
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-2">
        <div className="flex gap-2">
          {subTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeSubTab === tab.id
                  ? 'bg-brand-purple text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeSubTab === tab.id
                    ? 'bg-white/20 text-white'
                    : 'bg-neutral-200 text-neutral-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Contacts Tab Content */}
      {activeSubTab === 'contacts' && (
        <div className="space-y-4">
          {/* Add Contact Button */}
          <div className="flex justify-end">
            <button
              onClick={() => {
                setAddingContact(true);
                setConfirmDeleteId(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm font-medium"
            >
              <PlusIcon className="h-4 w-4" />
              Add Contact
            </button>
          </div>

          {/* Add Contact Form */}
          {addingContact && (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Add New Contact</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={newContact.name}
                    onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                    placeholder="Contact name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={newContact.email}
                    onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                    placeholder="email@school.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newContact.phone}
                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                    placeholder="Phone number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Role</label>
                  <input
                    type="text"
                    value={newContact.role}
                    onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                    placeholder="e.g., Principal, Coordinator"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleAddContact}
                  disabled={!newContact.name || !newContact.email || saving}
                  className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Contact'}
                </button>
                <button
                  onClick={() => {
                    setAddingContact(false);
                    setNewContact({ name: '', email: '', phone: '', role: '' });
                  }}
                  className="px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium text-neutral-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Contacts List */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple mx-auto"></div>
                <p className="mt-2 text-sm text-neutral-500">Loading contacts...</p>
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-8 text-center">
                <UserIcon className="mx-auto h-12 w-12 text-neutral-400" />
                <h3 className="mt-2 text-sm font-medium text-neutral-900">No contacts</h3>
                <p className="mt-1 text-sm text-neutral-500">Add contacts to track school communication</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-200">
                {contacts.map((contact) => (
                  <div key={contact.id} className="p-4 hover:bg-neutral-50 transition-colors group">
                    {editingContactId === contact.id ? (
                      /* Edit Mode */
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">Name *</label>
                            <input
                              type="text"
                              value={editContactData.name}
                              onChange={(e) => setEditContactData({ ...editContactData, name: e.target.value })}
                              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">Email *</label>
                            <input
                              type="email"
                              value={editContactData.email}
                              onChange={(e) => setEditContactData({ ...editContactData, email: e.target.value })}
                              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">Phone</label>
                            <input
                              type="tel"
                              value={editContactData.phone}
                              onChange={(e) => setEditContactData({ ...editContactData, phone: e.target.value })}
                              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">Role</label>
                            <input
                              type="text"
                              value={editContactData.role}
                              onChange={(e) => setEditContactData({ ...editContactData, role: e.target.value })}
                              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditContact(contact.id)}
                            disabled={!editContactData.name || !editContactData.email || saving}
                            className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {saving ? 'Saving...' : 'Save Changes'}
                          </button>
                          <button
                            onClick={cancelEditingContact}
                            className="px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium text-neutral-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Display Mode */
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-brand-purple/10 flex items-center justify-center flex-shrink-0">
                            <UserIcon className="h-5 w-5 text-brand-purple" />
                          </div>
                          <div>
                            <p className="font-medium text-neutral-900">{contact.name}</p>
                            {contact.role && (
                              <p className="text-sm text-neutral-500">{contact.role}</p>
                            )}
                            <div className="flex items-center gap-4 mt-1 flex-wrap">
                              {contact.email && (
                                <a
                                  href={`mailto:${contact.email}`}
                                  className="flex items-center gap-1 text-sm text-brand-purple hover:underline"
                                >
                                  <EnvelopeIcon className="h-4 w-4" />
                                  {contact.email}
                                </a>
                              )}
                              {contact.phone && (
                                <span className="flex items-center gap-1 text-sm text-neutral-500">
                                  <PhoneIcon className="h-4 w-4" />
                                  {contact.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEditingContact(contact)}
                            className="p-2 text-neutral-400 hover:text-brand-purple hover:bg-brand-purple/10 rounded-lg transition-colors"
                            title="Edit contact"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <div className="relative">
                            <button
                              onClick={() => setConfirmDeleteId(confirmDeleteId === contact.id ? null : contact.id)}
                              className={`p-2 rounded-lg transition-colors ${
                                confirmDeleteId === contact.id
                                  ? 'text-red-600 bg-red-50'
                                  : 'text-neutral-400 hover:text-red-600 hover:bg-red-50'
                              }`}
                              title="Delete contact"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                            {/* Delete Confirmation Popover */}
                            {confirmDeleteId === contact.id && (
                              <div className="absolute right-0 top-10 z-50 w-56 bg-white rounded-lg shadow-lg border border-neutral-200 p-3">
                                <div className="flex items-start gap-2 mb-3">
                                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                    <TrashIcon className="h-4 w-4 text-red-600" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-neutral-900">Delete contact?</p>
                                    <p className="text-xs text-neutral-500">This action cannot be undone.</p>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleDeleteContact(contact.id)}
                                    className="flex-1 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="flex-1 px-3 py-1.5 border border-neutral-300 text-neutral-700 text-sm font-medium rounded-md hover:bg-neutral-50 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                          <a
                            href={`mailto:${contact.email}`}
                            className="p-2 text-neutral-400 hover:text-brand-purple transition-colors"
                            title="Send email"
                          >
                            <PaperAirplaneIcon className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Campaigns Tab Content */}
      {activeSubTab === 'campaigns' && (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          {campaigns.length === 0 ? (
            <div className="p-8 text-center">
              <EnvelopeIcon className="mx-auto h-12 w-12 text-neutral-400" />
              <h3 className="mt-2 text-sm font-medium text-neutral-900">No email campaigns</h3>
              <p className="mt-1 text-sm text-neutral-500">Email campaigns for this school will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {campaigns.map((campaign, index) => (
                <div key={campaign.id || index} className="p-4 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-neutral-900">{campaign.subject || campaign.name}</p>
                      <p className="text-sm text-neutral-500 mt-1">{campaign.description || campaign.body?.substring(0, 100)}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-neutral-400">
                        <span className="flex items-center gap-1">
                          <CalendarDaysIcon className="h-4 w-4" />
                          {formatDate(campaign.sentAt || campaign.createdAt)}
                        </span>
                        {campaign.status && (
                          <span className={`px-2 py-0.5 rounded-full ${
                            campaign.status === 'sent' ? 'bg-green-100 text-green-800' :
                            campaign.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                            'bg-neutral-100 text-neutral-800'
                          }`}>
                            {campaign.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
