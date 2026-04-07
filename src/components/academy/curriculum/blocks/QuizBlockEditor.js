import React from 'react';
import { PlusIcon, TrashIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

export default function QuizBlockEditor({ block, onChange }) {
  const questions = block.questions || [];

  const addQuestion = () => {
    onChange({
      ...block,
      questions: [...questions, {
        id: Date.now().toString(),
        question: '',
        type: 'multiple_choice',
        options: ['', '', '', ''],
        correctAnswer: 0,
        explanation: '',
        points: 1
      }]
    });
  };

  const updateQuestion = (index, updates) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    onChange({ ...block, questions: newQuestions });
  };

  const removeQuestion = (index) => {
    onChange({ ...block, questions: questions.filter((_, i) => i !== index) });
  };

  const updateOption = (qIndex, oIndex, value) => {
    const newQuestions = [...questions];
    const newOptions = [...newQuestions[qIndex].options];
    newOptions[oIndex] = value;
    newQuestions[qIndex] = { ...newQuestions[qIndex], options: newOptions };
    onChange({ ...block, questions: newQuestions });
  };

  const addOption = (qIndex) => {
    const newQuestions = [...questions];
    newQuestions[qIndex] = {
      ...newQuestions[qIndex],
      options: [...newQuestions[qIndex].options, '']
    };
    onChange({ ...block, questions: newQuestions });
  };

  const removeOption = (qIndex, oIndex) => {
    const newQuestions = [...questions];
    const newOptions = newQuestions[qIndex].options.filter((_, i) => i !== oIndex);
    // Adjust correctAnswer if needed
    let correctAnswer = newQuestions[qIndex].correctAnswer;
    if (correctAnswer >= oIndex && correctAnswer > 0) {
      correctAnswer--;
    }
    newQuestions[qIndex] = {
      ...newQuestions[qIndex],
      options: newOptions,
      correctAnswer
    };
    onChange({ ...block, questions: newQuestions });
  };

  const moveQuestion = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= questions.length) return;
    const newQuestions = [...questions];
    [newQuestions[index], newQuestions[newIndex]] = [newQuestions[newIndex], newQuestions[index]];
    onChange({ ...block, questions: newQuestions });
  };

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={block.title || ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Quiz title"
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
      />

      <div className="flex gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-600">Passing score:</span>
          <input
            type="number"
            value={block.passingScore || 70}
            onChange={(e) => onChange({ ...block, passingScore: parseInt(e.target.value) || 70 })}
            min="0"
            max="100"
            className="w-16 px-2 py-1 border border-neutral-200 rounded text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
          />
          <span className="text-sm text-neutral-400">%</span>
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={block.shuffleQuestions || false}
            onChange={(e) => onChange({ ...block, shuffleQuestions: e.target.checked })}
            className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
          />
          Shuffle questions
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={block.showExplanations || true}
            onChange={(e) => onChange({ ...block, showExplanations: e.target.checked })}
            className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
          />
          Show explanations
        </label>
      </div>

      <div className="space-y-4">
        {questions.map((q, qIndex) => (
          <div key={q.id} className="border border-neutral-200 rounded-lg p-4 bg-neutral-50">
            <div className="flex items-start gap-2 mb-3">
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => moveQuestion(qIndex, -1)}
                  disabled={qIndex === 0}
                  className="p-1 text-neutral-400 hover:text-neutral-600 disabled:opacity-30 text-sm"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveQuestion(qIndex, 1)}
                  disabled={qIndex === questions.length - 1}
                  className="p-1 text-neutral-400 hover:text-neutral-600 disabled:opacity-30 text-sm"
                  title="Move down"
                >
                  ↓
                </button>
              </div>
              <span className="text-sm font-medium text-neutral-500 pt-1">Q{qIndex + 1}</span>
              <div className="flex-1">
                <textarea
                  value={q.question}
                  onChange={(e) => updateQuestion(qIndex, { question: e.target.value })}
                  placeholder="Enter your question..."
                  rows={2}
                  className="w-full px-2 py-1.5 border border-neutral-200 rounded text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple resize-none"
                />
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={q.points || 1}
                  onChange={(e) => updateQuestion(qIndex, { points: parseInt(e.target.value) || 1 })}
                  min="1"
                  className="w-12 px-1 py-1 border border-neutral-200 rounded text-xs text-center focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                />
                <span className="text-xs text-neutral-400">pts</span>
              </div>
              <button
                onClick={() => removeQuestion(qIndex)}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                title="Remove question"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Answer options */}
            <div className="ml-8 space-y-2">
              <p className="text-xs text-neutral-500 mb-2">Click the circle to mark the correct answer:</p>
              {q.options.map((option, oIndex) => (
                <div key={oIndex} className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuestion(qIndex, { correctAnswer: oIndex })}
                    className={`p-0.5 rounded-full transition-colors ${
                      q.correctAnswer === oIndex
                        ? 'text-green-500'
                        : 'text-neutral-300 hover:text-neutral-400'
                    }`}
                    title={q.correctAnswer === oIndex ? 'Correct answer' : 'Mark as correct'}
                  >
                    <CheckCircleIcon className="h-5 w-5" />
                  </button>
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                    placeholder={`Option ${oIndex + 1}`}
                    className={`flex-1 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple ${
                      q.correctAnswer === oIndex
                        ? 'border-green-300 bg-green-50'
                        : 'border-neutral-200'
                    }`}
                  />
                  {q.options.length > 2 && (
                    <button
                      onClick={() => removeOption(qIndex, oIndex)}
                      className="p-1 text-neutral-400 hover:text-red-500"
                      title="Remove option"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {q.options.length < 6 && (
                <button
                  onClick={() => addOption(qIndex)}
                  className="text-xs text-brand-purple hover:underline ml-7"
                >
                  + Add option
                </button>
              )}
            </div>

            {/* Explanation */}
            <div className="ml-8 mt-3">
              <textarea
                value={q.explanation || ''}
                onChange={(e) => updateQuestion(qIndex, { explanation: e.target.value })}
                placeholder="Explanation (shown after answering)..."
                rows={2}
                className="w-full px-2 py-1.5 border border-neutral-200 rounded text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple resize-none"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addQuestion}
        className="flex items-center gap-2 px-3 py-2 text-sm text-brand-purple hover:bg-brand-purple/5 rounded-lg transition-colors"
      >
        <PlusIcon className="h-4 w-4" />
        Add question
      </button>

      {/* Summary */}
      {questions.length > 0 && (
        <div className="text-xs text-neutral-500 pt-2 border-t">
          {questions.length} question{questions.length !== 1 ? 's' : ''} •
          {questions.reduce((sum, q) => sum + (q.points || 1), 0)} total points •
          Pass at {block.passingScore || 70}%
        </div>
      )}
    </div>
  );
}
