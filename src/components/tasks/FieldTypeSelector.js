import React from 'react';
import {
  DocumentTextIcon,
  CalculatorIcon,
  CalendarIcon,
  CheckCircleIcon,
  UserGroupIcon,
  TagIcon,
  LinkIcon,
  PaperClipIcon,
  StarIcon,
  CodeBracketIcon
} from '@heroicons/react/24/outline';

const FIELD_TYPES = [
  {
    type: 'text',
    label: 'Text',
    icon: DocumentTextIcon,
    subtypes: [
      { value: 'short', label: 'Short Text' },
      { value: 'long', label: 'Long Text' },
      { value: 'rich', label: 'Rich Text' }
    ],
    description: 'Single or multi-line text'
  },
  {
    type: 'number',
    label: 'Number',
    icon: CalculatorIcon,
    subtypes: [
      { value: 'integer', label: 'Integer' },
      { value: 'decimal', label: 'Decimal' },
      { value: 'currency', label: 'Currency' }
    ],
    description: 'Numeric values'
  },
  {
    type: 'date',
    label: 'Date',
    icon: CalendarIcon,
    subtypes: [
      { value: 'date', label: 'Date' },
      { value: 'datetime', label: 'Date & Time' }
    ],
    description: 'Date or date and time'
  },
  {
    type: 'status',
    label: 'Status',
    icon: CheckCircleIcon,
    subtypes: null,
    description: 'Dropdown with colored options'
  },
  {
    type: 'people',
    label: 'People',
    icon: UserGroupIcon,
    subtypes: null,
    description: 'Select one or more people'
  },
  {
    type: 'tags',
    label: 'Tags',
    icon: TagIcon,
    subtypes: null,
    description: 'Multiple tags'
  },
  {
    type: 'checkbox',
    label: 'Checkbox',
    icon: CheckCircleIcon,
    subtypes: null,
    description: 'True/false checkbox'
  },
  {
    type: 'rating',
    label: 'Rating',
    icon: StarIcon,
    subtypes: null,
    description: 'Star rating (1-5)'
  },
  {
    type: 'link',
    label: 'Link',
    icon: LinkIcon,
    subtypes: null,
    description: 'URL link'
  },
  {
    type: 'file',
    label: 'File',
    icon: PaperClipIcon,
    subtypes: null,
    description: 'File attachment reference'
  },
  {
    type: 'formula',
    label: 'Formula',
    icon: CodeBracketIcon,
    subtypes: null,
    description: 'Calculated field'
  },
  {
    type: 'relation',
    label: 'Relation',
    icon: LinkIcon,
    subtypes: null,
    description: 'Link to other items'
  }
];

export default function FieldTypeSelector({ selectedType, selectedSubtype, onTypeChange, onSubtypeChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-2">Field Type</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FIELD_TYPES.map((fieldType) => {
            const Icon = fieldType.icon;
            const isSelected = selectedType === fieldType.type;
            return (
              <button
                key={fieldType.type}
                type="button"
                onClick={() => onTypeChange(fieldType.type)}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  isSelected
                    ? 'border-brand-purple bg-brand-purple/10'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-5 w-5 ${isSelected ? 'text-brand-purple' : 'text-neutral-400'}`} />
                  <span className={`text-sm font-medium ${isSelected ? 'text-brand-purple' : 'text-neutral-700'}`}>
                    {fieldType.label}
                  </span>
                </div>
                <p className="text-xs text-neutral-500">{fieldType.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {selectedType && FIELD_TYPES.find(ft => ft.type === selectedType)?.subtypes && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">Subtype</label>
          <select
            value={selectedSubtype || ''}
            onChange={(e) => onSubtypeChange(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
          >
            <option value="">Select subtype...</option>
            {FIELD_TYPES.find(ft => ft.type === selectedType)?.subtypes.map((subtype) => (
              <option key={subtype.value} value={subtype.value}>
                {subtype.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export { FIELD_TYPES };
