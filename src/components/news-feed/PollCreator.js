/**
 * PollCreator - Create polls for posts
 */

import React, { useState } from 'react';
import {
  PlusIcon,
  XMarkIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

const PollCreator = ({ onSave, onCancel, initialData = null }) => {
  const [question, setQuestion] = useState(initialData?.question || '');
  const [options, setOptions] = useState(initialData?.options || ['', '']);
  const [multipleChoice, setMultipleChoice] = useState(initialData?.multiple_choice || false);
  const [duration, setDuration] = useState('1_day');

  const addOption = () => {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  };

  const removeOption = (index) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSave = () => {
    const validOptions = options.filter(o => o.trim());
    if (!question.trim() || validOptions.length < 2) {
      return;
    }

    // Calculate end date based on duration
    const now = new Date();
    let endsAt = null;
    switch (duration) {
      case '1_day':
        endsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        break;
      case '3_days':
        endsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        break;
      case '1_week':
        endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'no_limit':
      default:
        endsAt = null;
    }

    onSave({
      question: question.trim(),
      options: validOptions,
      multiple_choice: multipleChoice,
      ends_at: endsAt?.toISOString() || null,
    });
  };

  const isValid = question.trim() && options.filter(o => o.trim()).length >= 2;

  return (
    <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
      <div className="flex items-center gap-2 mb-4">
        <ChartBarIcon className="h-5 w-5 text-brand-purple" />
        <h3 className="font-semibold text-neutral-900">Create Poll</h3>
      </div>

      {/* Question */}
      <div className="mb-4">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question..."
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple text-sm"
          maxLength={200}
        />
        <p className="text-xs text-neutral-500 mt-1 text-right">{question.length}/200</p>
      </div>

      {/* Options */}
      <div className="space-y-2 mb-4">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={option}
              onChange={(e) => updateOption(index, e.target.value)}
              placeholder={`Option ${index + 1}`}
              className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple text-sm"
              maxLength={100}
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(index)}
                className="p-2 text-neutral-400 hover:text-red-500"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        {options.length < 6 && (
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1 text-sm text-brand-purple hover:text-brand-navy"
          >
            <PlusIcon className="h-4 w-4" />
            <span>Add option</span>
          </button>
        )}
      </div>

      {/* Settings */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={multipleChoice}
            onChange={(e) => setMultipleChoice(e.target.checked)}
            className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
          />
          <span className="text-neutral-700">Allow multiple answers</span>
        </label>

        <div className="flex items-center gap-2">
          <span className="text-neutral-600">Duration:</span>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="px-2 py-1 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
          >
            <option value="1_day">1 day</option>
            <option value="3_days">3 days</option>
            <option value="1_week">1 week</option>
            <option value="no_limit">No limit</option>
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isValid}
          className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add Poll
        </button>
      </div>
    </div>
  );
};

export default PollCreator;

