import { useState, useEffect } from 'react';
import {
  QuestionMarkCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { useToast } from '../hooks/useToast';

/**
 * KnowledgeQuestions - Private Q&A interface
 * Franchisees can ask questions that only the franchisor can see and answer
 * Other franchisees cannot see each other's questions
 */
export default function KnowledgeQuestions({ articleId = null, isMainBranch = false }) {
  const toast = useToast();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    subject: '',
    question: '',
    priority: 'normal'
  });
  const [submitting, setSubmitting] = useState(false);
  const [answeringQuestion, setAnsweringQuestion] = useState(null);
  const [answerText, setAnswerText] = useState('');

  useEffect(() => {
    fetchQuestions();
  }, [articleId]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      let url = '/api/knowledge/questions';

      if (articleId) {
        url += `?article_id=${articleId}`;
      }

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setQuestions(data.questions || []);
      }
    } catch (error) {
      console.error('Error fetching questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.subject.trim() || !formData.question.trim()) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/knowledge/questions', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          article_id: articleId,
          subject: formData.subject,
          question: formData.question,
          priority: formData.priority
        })
      });

      if (response.ok) {
        const data = await response.json();
        setQuestions([data.question, ...questions]);
        setFormData({ subject: '', question: '', priority: 'normal' });
        setShowForm(false);
      }
    } catch (error) {
      console.error('Error submitting question:', error);
      toast.error('Failed to submit question. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnswer = async (questionId) => {
    if (!answerText.trim()) {
      return;
    }

    try {
      const response = await fetch(`/api/knowledge/questions/${questionId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          answer: answerText,
          status: 'answered'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setQuestions(questions.map(q => q.id === questionId ? data.question : q));
        setAnsweringQuestion(null);
        setAnswerText('');
      }
    } catch (error) {
      console.error('Error answering question:', error);
      toast.error('Failed to answer question. Please try again.');
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'answered':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'closed':
        return <XCircleIcon className="h-5 w-5 text-neutral-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <QuestionMarkCircleIcon className="h-6 w-6 text-brand-purple" />
          <h3 className="text-lg font-semibold text-neutral-900">
            {isMainBranch ? 'Questions from Franchisees' : 'Your Questions'}
          </h3>
        </div>

        {!isMainBranch && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-brand-purple text-white text-sm rounded-lg hover:bg-brand-navy transition-colors"
          >
            Ask Question
          </button>
        )}
      </div>

      {/* Question Form */}
      {showForm && !isMainBranch && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-neutral-50 rounded-lg border border-neutral-200">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Brief description of your question"
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Question
              </label>
              <textarea
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                placeholder="Please provide as much detail as possible..."
                rows={4}
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent resize-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit Question'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setFormData({ subject: '', question: '', priority: 'normal' });
                }}
                className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Questions List */}
      {loading ? (
        <div className="text-center py-8 text-neutral-500">
          <p>Loading questions...</p>
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-8 px-4 bg-gradient-to-br from-brand-light/30 to-white rounded-lg border border-neutral-100">
          <QuestionMarkCircleIcon className="mx-auto h-12 w-12 text-neutral-400 mb-3" />
          <p className="text-sm font-medium text-neutral-700">No questions yet</p>
          <p className="text-sm text-neutral-500 mt-1">
            {isMainBranch 
              ? 'No questions from franchisees yet.'
              : 'Have a question? Click "Ask Question" above!'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((question) => (
            <div
              key={question.id}
              className="border border-neutral-200 rounded-lg p-4 hover:border-brand-purple transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusIcon(question.status)}
                    <h4 className="text-base font-semibold text-neutral-900">
                      {question.subject}
                    </h4>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {isMainBranch && `From: ${question.user_name} • `}
                    Asked {formatDate(question.created_at)}
                  </p>
                </div>

                <span
                  className={`px-2 py-1 text-xs font-medium rounded border ${getPriorityColor(
                    question.priority
                  )}`}
                >
                  {question.priority}
                </span>
              </div>

              <p className="text-sm text-neutral-700 mb-3 whitespace-pre-wrap">
                {question.question}
              </p>

              {question.answer ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
                  <p className="text-xs text-green-700 font-medium mb-1">
                    Answered {formatDate(question.answered_at)}
                  </p>
                  <p className="text-sm text-neutral-800 whitespace-pre-wrap">
                    {question.answer}
                  </p>
                </div>
              ) : (
                isMainBranch &&
                question.status === 'open' && (
                  <div className="mt-3">
                    {answeringQuestion === question.id ? (
                      <div>
                        <textarea
                          value={answerText}
                          onChange={(e) => setAnswerText(e.target.value)}
                          placeholder="Type your answer..."
                          rows={3}
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent resize-none text-sm"
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => handleAnswer(question.id)}
                            className="px-3 py-1 bg-brand-purple text-white text-sm rounded hover:bg-brand-navy transition-colors"
                          >
                            Submit Answer
                          </button>
                          <button
                            onClick={() => {
                              setAnsweringQuestion(null);
                              setAnswerText('');
                            }}
                            className="px-3 py-1 bg-neutral-200 text-neutral-700 text-sm rounded hover:bg-neutral-300 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAnsweringQuestion(question.id)}
                        className="px-3 py-1 bg-brand-purple text-white text-sm rounded hover:bg-brand-navy transition-colors"
                      >
                        Answer
                      </button>
                    )}
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

