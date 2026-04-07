import React, { useState, useEffect } from 'react';
import { 
  LinkIcon,
  PlusIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import ConfirmationModal from '../ConfirmationModal';
import { useToast } from '../../hooks/useToast';

const RELATION_TYPES = [
  { value: 'link', label: 'Links to', icon: LinkIcon },
  { value: 'blocks', label: 'Blocks', icon: ArrowRightIcon },
  { value: 'blocked_by', label: 'Blocked by', icon: ArrowRightIcon },
  { value: 'relates_to', label: 'Relates to', icon: LinkIcon },
  { value: 'duplicates', label: 'Duplicates', icon: LinkIcon },
  { value: 'duplicated_by', label: 'Duplicated by', icon: LinkIcon }
];

export default function ItemRelations({ taskId, onRelationClick }) {
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [relations, setRelations] = useState([]);
  const [reverseRelations, setReverseRelations] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (taskId) {
      fetchRelations();
    }
  }, [taskId]);

  const fetchRelations = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/items/${taskId}/relations`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setRelations(data.relations || []);
        setReverseRelations(data.reverse_relations || []);
      }
    } catch (error) {
      console.error('Error fetching relations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRelation = async (relationData) => {
    try {
      const response = await fetch(`/api/tasks/items/${taskId}/relations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(relationData),
      });

      if (response.ok) {
        setIsAdding(false);
        fetchRelations();
      }
    } catch (error) {
      console.error('Error creating relation:', error);
    }
  };

  const handleDeleteRelation = (relationId) => {
    setConfirmState({
      isOpen: true,
      title: 'Remove Relation',
      message: 'Are you sure you want to remove this relation?',
      action: async () => {
        try {
          const response = await fetch(`/api/tasks/relations/${relationId}`, {
            method: 'DELETE',
            credentials: 'include',
          });

          if (response.ok) {
            fetchRelations();
          }
        } catch (error) {
          console.error('Error deleting relation:', error);
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-purple mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">Relations</h3>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-brand-purple hover:bg-brand-purple/10 rounded"
          >
            <PlusIcon className="h-4 w-4" />
            Add
          </button>
        )}
      </div>

      {isAdding && (
        <RelationForm
          onSubmit={handleCreateRelation}
          onCancel={() => setIsAdding(false)}
        />
      )}

      {/* Outgoing Relations */}
      {relations.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-neutral-500 uppercase mb-2">Linked Items</h4>
          <div className="space-y-2">
            {relations.map((relation) => {
              const relationType = RELATION_TYPES.find(rt => rt.value === relation.relation_type);
              const Icon = relationType?.icon || LinkIcon;
              
              return (
                <div
                  key={relation.id}
                  className="flex items-center justify-between p-2 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Icon className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                    {relation.external_url ? (
                      <a
                        href={relation.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-brand-purple hover:text-brand-navy truncate"
                      >
                        <span className="truncate">{relation.external_title || relation.external_url}</span>
                        <ArrowTopRightOnSquareIcon className="h-3 w-3 flex-shrink-0" />
                      </a>
                    ) : relation.related_item_name ? (
                      <button
                        onClick={() => onRelationClick && onRelationClick(relation.related_item_id)}
                        className="text-sm text-brand-purple hover:text-brand-navy truncate text-left"
                      >
                        {relation.related_item_name}
                      </button>
                    ) : relation.related_board_name ? (
                      <span className="text-sm text-neutral-700 truncate">
                        Board: {relation.related_board_name}
                      </span>
                    ) : null}
                    <span className="text-xs text-neutral-500">
                      {relationType?.label || relation.relation_type}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteRelation(relation.id)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded flex-shrink-0"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Incoming Relations */}
      {reverseRelations.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-neutral-500 uppercase mb-2">Linked From</h4>
          <div className="space-y-2">
            {reverseRelations.map((relation) => (
              <div
                key={relation.id}
                className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors"
              >
                <LinkIcon className="h-4 w-4 text-neutral-400" />
                <button
                  onClick={() => onRelationClick && onRelationClick(relation.item_id)}
                  className="text-sm text-brand-purple hover:text-brand-navy truncate flex-1 text-left"
                >
                  {relation.item_name}
                </button>
                <span className="text-xs text-neutral-500">
                  {RELATION_TYPES.find(rt => rt.value === relation.relation_type)?.label || relation.relation_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {relations.length === 0 && reverseRelations.length === 0 && !isAdding && (
        <p className="text-sm text-neutral-500 text-center py-4">No relations yet</p>
      )}
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
      />
    </div>
  );
}

function RelationForm({ onSubmit, onCancel }) {
  const toast = useToast();
  const [relationType, setRelationType] = useState('link');
  const [relatedItemId, setRelatedItemId] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [externalTitle, setExternalTitle] = useState('');
  const [linkType, setLinkType] = useState('item'); // 'item', 'board', 'external'

  const handleSubmit = () => {
    if (linkType === 'external' && !externalUrl.trim()) {
      toast.error('External URL is required');
      return;
    }
    if (linkType === 'item' && !relatedItemId) {
      toast.error('Please select an item');
      return;
    }

    const relationData = {
      relation_type: relationType
    };

    if (linkType === 'external') {
      relationData.external_url = externalUrl.trim();
      relationData.external_title = externalTitle.trim() || externalUrl.trim();
    } else if (linkType === 'item') {
      relationData.related_item_id = relatedItemId;
    } else {
      relationData.related_board_id = relatedItemId;
    }

    onSubmit(relationData);
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">Relation Type</label>
        <select
          value={relationType}
          onChange={(e) => setRelationType(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
        >
          {RELATION_TYPES.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">Link To</label>
        <select
          value={linkType}
          onChange={(e) => {
            setLinkType(e.target.value);
            setRelatedItemId('');
            setExternalUrl('');
            setExternalTitle('');
          }}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple mb-2"
        >
          <option value="item">Another Task</option>
          <option value="board">A Board</option>
          <option value="external">External URL</option>
        </select>

        {linkType === 'external' ? (
          <>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple mb-2"
            />
            <input
              type="text"
              value={externalTitle}
              onChange={(e) => setExternalTitle(e.target.value)}
              placeholder="Link title (optional)"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
            />
          </>
        ) : (
          <input
            type="text"
            value={relatedItemId}
            onChange={(e) => setRelatedItemId(e.target.value)}
            placeholder={`Enter ${linkType === 'item' ? 'task' : 'board'} ID...`}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
          />
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="px-3 py-1.5 text-sm bg-brand-purple text-white rounded-lg hover:bg-brand-navy"
        >
          Add Relation
        </button>
      </div>
    </div>
  );
}
