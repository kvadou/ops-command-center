import React, { useState, useEffect } from 'react';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import FieldTypeSelector, { FIELD_TYPES } from './FieldTypeSelector';
import FormulaBuilder from './FormulaBuilder';

export default function CustomFieldEditor({ field, boardId, onSave, onCancel, onDelete, availableFields = [] }) {
  const [name, setName] = useState(field?.name || '');
  const [fieldType, setFieldType] = useState(field?.field_type || '');
  const [fieldSubtype, setFieldSubtype] = useState(field?.field_subtype || '');
  const [isRequired, setIsRequired] = useState(field?.is_required || false);
  const [defaultValue, setDefaultValue] = useState(field?.default_value || '');
  const [fieldConfig, setFieldConfig] = useState(field?.field_config || {});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (field) {
      setName(field.name || '');
      setFieldType(field.field_type || '');
      setFieldSubtype(field.field_subtype || '');
      setIsRequired(field.is_required || false);
      setDefaultValue(field.default_value || '');
      setFieldConfig(field.field_config || {});
    }
  }, [field]);

  const handleSave = () => {
    const newErrors = {};
    
    if (!name.trim()) {
      newErrors.name = 'Field name is required';
    }
    
    if (!fieldType) {
      newErrors.fieldType = 'Field type is required';
    }

    // Validate subtype for types that require it
    const fieldTypeDef = FIELD_TYPES.find(ft => ft.type === fieldType);
    if (fieldTypeDef?.subtypes && !fieldSubtype) {
      newErrors.subtype = 'Subtype is required for this field type';
    }

    // Validate field config for specific types
    if (fieldType === 'status' && (!fieldConfig.options || fieldConfig.options.length === 0)) {
      newErrors.statusOptions = 'At least one status option is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const fieldData = {
      name: name.trim(),
      field_type: fieldType,
      field_subtype: fieldSubtype || null,
      is_required: isRequired,
      default_value: defaultValue || null,
      field_config: fieldConfig
    };

    onSave(fieldData);
  };

  const updateStatusOption = (index, key, value) => {
    const newOptions = [...(fieldConfig.options || [])];
    if (!newOptions[index]) {
      newOptions[index] = { label: '', color: '#6b7280' };
    }
    newOptions[index][key] = value;
    setFieldConfig({ ...fieldConfig, options: newOptions });
  };

  const addStatusOption = () => {
    const newOptions = [...(fieldConfig.options || []), { label: '', color: '#6b7280' }];
    setFieldConfig({ ...fieldConfig, options: newOptions });
  };

  const removeStatusOption = (index) => {
    const newOptions = fieldConfig.options.filter((_, i) => i !== index);
    setFieldConfig({ ...fieldConfig, options: newOptions });
  };

  const updateTagsList = (tags) => {
    setFieldConfig({ ...fieldConfig, options: tags });
  };

  const updateRatingMax = (max) => {
    setFieldConfig({ ...fieldConfig, max: parseInt(max) || 5 });
  };

  const updatePeopleConfig = (key, value) => {
    setFieldConfig({ ...fieldConfig, [key]: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Field Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter field name..."
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple ${
            errors.name ? 'border-red-300' : 'border-neutral-300'
          }`}
        />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
      </div>

      <FieldTypeSelector
        selectedType={fieldType}
        selectedSubtype={fieldSubtype}
        onTypeChange={(type) => {
          setFieldType(type);
          setFieldSubtype('');
          setFieldConfig({});
        }}
        onSubtypeChange={setFieldSubtype}
      />
      {errors.fieldType && <p className="text-xs text-red-600">{errors.fieldType}</p>}
      {errors.subtype && <p className="text-xs text-red-600">{errors.subtype}</p>}

      {/* Field-specific configuration */}
      {fieldType === 'status' && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Status Options <span className="text-red-500">*</span>
          </label>
          <div className="space-y-2">
            {(fieldConfig.options || []).map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={option.label || ''}
                  onChange={(e) => updateStatusOption(index, 'label', e.target.value)}
                  placeholder="Option label"
                  className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                />
                <input
                  type="color"
                  value={option.color || '#6b7280'}
                  onChange={(e) => updateStatusOption(index, 'color', e.target.value)}
                  className="w-12 h-10 border border-neutral-300 rounded"
                />
                <button
                  type="button"
                  onClick={() => removeStatusOption(index)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addStatusOption}
              className="flex items-center gap-2 px-3 py-2 text-sm text-brand-purple hover:bg-brand-purple/10 rounded-lg border border-brand-purple"
            >
              <PlusIcon className="h-4 w-4" />
              Add Option
            </button>
          </div>
          {errors.statusOptions && <p className="mt-1 text-xs text-red-600">{errors.statusOptions}</p>}
        </div>
      )}

      {fieldType === 'tags' && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">Tag Options</label>
          <textarea
            value={(fieldConfig.options || []).join('\n')}
            onChange={(e) => updateTagsList(e.target.value.split('\n').filter(t => t.trim()))}
            placeholder="Enter tags, one per line"
            rows={4}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          />
        </div>
      )}

      {fieldType === 'rating' && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">Maximum Rating</label>
          <input
            type="number"
            min="1"
            max="10"
            value={fieldConfig.max || 5}
            onChange={(e) => updateRatingMax(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          />
        </div>
      )}

      {fieldType === 'people' && (
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={fieldConfig.multiple !== false}
              onChange={(e) => updatePeopleConfig('multiple', e.target.checked)}
              className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
            />
            <span className="text-sm font-medium text-neutral-700">Allow multiple people</span>
          </label>
        </div>
      )}

      {fieldType === 'formula' && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">Formula</label>
          <FormulaBuilder
            formula={fieldConfig.formula || ''}
            onFormulaChange={(formula) => setFieldConfig({ ...fieldConfig, formula })}
            availableFields={availableFields.filter(f => f.field_type !== 'formula')}
          />
        </div>
      )}

      {fieldType === 'relation' && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">Related Board ID</label>
          <input
            type="text"
            value={fieldConfig.related_board_id || ''}
            onChange={(e) => setFieldConfig({ ...fieldConfig, related_board_id: e.target.value })}
            placeholder="UUID of related board"
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isRequired"
          checked={isRequired}
          onChange={(e) => setIsRequired(e.target.checked)}
          className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
        />
        <label htmlFor="isRequired" className="text-sm font-medium text-neutral-700">
          Required field
        </label>
      </div>

      {['text', 'number'].includes(fieldType) && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Default Value</label>
          <input
            type={fieldType === 'number' ? 'number' : 'text'}
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            placeholder="Default value (optional)"
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t">
        {field && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg"
          >
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 rounded-lg border border-neutral-300"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-purple hover:bg-brand-navy rounded-lg"
        >
          {field ? 'Update' : 'Create'} Field
        </button>
      </div>
    </div>
  );
}
