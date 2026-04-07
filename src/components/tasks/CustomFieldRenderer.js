import React from 'react';
import DOMPurify from 'dompurify';
import {
  UserIcon,
  TagIcon,
  LinkIcon,
  DocumentIcon,
  CheckCircleIcon,
  StarIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

// Render custom field value based on field type
export default function CustomFieldRenderer({ field, value, onUpdate, editable = false }) {
  if (!field || value === null || value === undefined) {
    return <span className="text-neutral-400 text-sm">-</span>;
  }

  const fieldValue = getFieldValue(field, value);

  switch (field.field_type) {
    case 'text':
      return (
        <div className="text-sm text-neutral-900">
          {field.field_subtype === 'rich' ? (
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(fieldValue) }} />
          ) : (
            <span className="truncate">{fieldValue}</span>
          )}
        </div>
      );

    case 'number':
      const formattedNumber = field.field_subtype === 'currency' 
        ? `$${parseFloat(fieldValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : parseFloat(fieldValue || 0).toLocaleString('en-US');
      return <span className="text-sm text-neutral-900 font-medium">{formattedNumber}</span>;

    case 'date':
    case 'datetime':
      if (!fieldValue) return <span className="text-neutral-400 text-sm">-</span>;
      const date = new Date(fieldValue);
      const format = field.field_type === 'datetime' 
        ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return (
        <div className="flex items-center gap-1 text-sm text-neutral-700">
          <CalendarIcon className="h-4 w-4" />
          <span>{format}</span>
        </div>
      );

    case 'status':
      if (!fieldValue || !fieldValue.label) return <span className="text-neutral-400 text-sm">-</span>;
      const statusColor = fieldValue.color || '#6b7280';
      return (
        <span 
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={{ 
            backgroundColor: `${statusColor}20`,
            color: statusColor,
            borderColor: `${statusColor}40`
          }}
        >
          {fieldValue.label}
        </span>
      );

    case 'people':
      if (!Array.isArray(fieldValue) || fieldValue.length === 0) {
        return <span className="text-neutral-400 text-sm">-</span>;
      }
      return (
        <div className="flex items-center gap-1 flex-wrap">
          {fieldValue.slice(0, 3).map((person, idx) => (
            <div key={idx} className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
              <UserIcon className="h-3 w-3" />
              <span>{person.name || person.email || person}</span>
            </div>
          ))}
          {fieldValue.length > 3 && (
            <span className="text-xs text-neutral-500">+{fieldValue.length - 3}</span>
          )}
        </div>
      );

    case 'tags':
      if (!Array.isArray(fieldValue) || fieldValue.length === 0) {
        return <span className="text-neutral-400 text-sm">-</span>;
      }
      return (
        <div className="flex items-center gap-1 flex-wrap">
          {fieldValue.map((tag, idx) => (
            <span key={idx} className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded text-xs">
              <TagIcon className="h-3 w-3" />
              {tag}
            </span>
          ))}
        </div>
      );

    case 'checkbox':
      return (
        <div className="flex items-center">
          {fieldValue ? (
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
          ) : (
            <div className="h-5 w-5 border-2 border-neutral-300 rounded" />
          )}
        </div>
      );

    case 'rating':
      const rating = parseInt(fieldValue) || 0;
      const maxRating = field.field_config?.max || 5;
      return (
        <div className="flex items-center gap-0.5">
          {Array.from({ length: maxRating }).map((_, idx) => (
            idx < rating ? (
              <StarIconSolid key={idx} className="h-4 w-4 text-yellow-400" />
            ) : (
              <StarIcon key={idx} className="h-4 w-4 text-neutral-300" />
            )
          ))}
        </div>
      );

    case 'link':
      if (!fieldValue || !fieldValue.url) return <span className="text-neutral-400 text-sm">-</span>;
      return (
        <a 
          href={fieldValue.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-brand-purple hover:text-brand-navy"
        >
          <LinkIcon className="h-4 w-4" />
          <span className="truncate max-w-[200px]">{fieldValue.text || fieldValue.url}</span>
        </a>
      );

    case 'file':
      if (!fieldValue || !fieldValue.filename) return <span className="text-neutral-400 text-sm">-</span>;
      return (
        <div className="flex items-center gap-1 text-sm text-neutral-700">
          <DocumentIcon className="h-4 w-4" />
          <span className="truncate max-w-[200px]">{fieldValue.filename}</span>
        </div>
      );

    case 'formula':
      // Formula fields are calculated on the backend
      // Check if value has calculated_value property (from API)
      const calculatedValue = value?.calculated_value !== undefined 
        ? value.calculated_value 
        : (typeof fieldValue === 'object' && fieldValue?.calculated_value !== undefined 
            ? fieldValue.calculated_value 
            : fieldValue);
      return (
        <span className="text-sm text-neutral-900 font-medium">
          {calculatedValue !== null && calculatedValue !== undefined ? String(calculatedValue) : '-'}
        </span>
      );

    case 'relation':
      if (!fieldValue || !Array.isArray(fieldValue) || fieldValue.length === 0) {
        return <span className="text-neutral-400 text-sm">-</span>;
      }
      return (
        <div className="flex items-center gap-1">
          {fieldValue.slice(0, 2).map((item, idx) => (
            <span key={idx} className="text-sm text-brand-purple hover:text-brand-navy cursor-pointer">
              {item.name || item.id}
            </span>
          ))}
          {fieldValue.length > 2 && (
            <span className="text-xs text-neutral-500">+{fieldValue.length - 2}</span>
          )}
        </div>
      );

    default:
      return <span className="text-sm text-neutral-700">{String(fieldValue)}</span>;
  }
}

// Helper function to extract the correct value from field value object
function getFieldValue(field, value) {
  if (!value) return null;
  
  // If value is a field value row from database (has field_id property)
  if (typeof value === 'object' && !Array.isArray(value) && value.field_id) {
    switch (field.field_type) {
      case 'text':
        return value.text_value;
      case 'number':
        return value.number_value;
      case 'date':
      case 'datetime':
        return value.date_value;
      case 'checkbox':
        return value.boolean_value;
      case 'status':
      case 'people':
      case 'tags':
      case 'relation':
      case 'link':
      case 'file':
        try {
          return value.json_value ? (typeof value.json_value === 'string' ? JSON.parse(value.json_value) : value.json_value) : null;
        } catch (e) {
          return null;
        }
      default:
        return value.text_value || value.number_value || value.date_value || value.boolean_value || value.json_value;
    }
  }
  
  // Otherwise, value is already the extracted value
  return value;
}
