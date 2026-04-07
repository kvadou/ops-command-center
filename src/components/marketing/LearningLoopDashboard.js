// src/components/marketing/LearningLoopDashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  AcademicCapIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

/**
 * Accuracy gauge component showing a circular progress indicator
 */
const AccuracyGauge = ({ accuracy }) => {
  // Clamp accuracy to 0-1 range to handle malformed data
  const clampedAccuracy = Math.min(1, Math.max(0, accuracy || 0));
  const percentage = Math.round(clampedAccuracy * 100);
  const color = percentage >= 80 ? '#10b981' : percentage >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative w-20 h-20">
      <svg className="w-20 h-20 transform -rotate-90">
        <circle
          cx="40"
          cy="40"
          r="36"
          stroke="#e5e7eb"
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx="40"
          cy="40"
          r="36"
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeDasharray={`${percentage * 2.26} 226`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-semibold">{percentage}%</span>
      </div>
    </div>
  );
};

/**
 * Learning Loop Dashboard Component
 * Displays AI prediction accuracy and calibration data
 */
export default function LearningLoopDashboard() {
  const [accuracy, setAccuracy] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [calibration, setCalibration] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  // Safe number parsing helper to handle null/undefined/NaN values
  const safeParseFloat = useCallback((value, defaultValue = 0) => {
    if (value === null || value === undefined) return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      const [accRes, predRes, calRes] = await Promise.all([
        fetch('/api/marketing-command-center/learning/accuracy'),
        fetch('/api/marketing-command-center/learning/predictions?limit=10'),
        fetch('/api/marketing-command-center/learning/calibrations'),
      ]);

      // Handle accuracy response with try-catch for JSON parsing
      if (accRes.ok) {
        try {
          const data = await accRes.json();
          // API returns { success: true, summary: [...] }
          const summaryData = data.summary || data;
          setAccuracy(Array.isArray(summaryData) ? summaryData : []);
        } catch (parseError) {
          console.error('Failed to parse accuracy data:', parseError);
        }
      } else {
        console.error('Failed to fetch accuracy data:', accRes.status);
      }

      // Handle predictions response with try-catch for JSON parsing
      if (predRes.ok) {
        try {
          const data = await predRes.json();
          // API returns array directly
          setPredictions(Array.isArray(data) ? data : []);
        } catch (parseError) {
          console.error('Failed to parse predictions data:', parseError);
        }
      } else {
        console.error('Failed to fetch predictions data:', predRes.status);
      }

      // Handle calibration response with try-catch for JSON parsing
      if (calRes.ok) {
        try {
          const data = await calRes.json();
          // API returns { success: true, calibrations: [...] }
          const calibrationData = data.calibrations || data;
          setCalibration(Array.isArray(calibrationData) ? calibrationData : []);
        } catch (parseError) {
          console.error('Failed to parse calibration data:', parseError);
        }
      } else {
        console.error('Failed to fetch calibration data:', calRes.status);
      }
    } catch (err) {
      console.error('Error fetching learning data:', err);
      setError('Failed to load learning data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRunLearning = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch('/api/marketing-command-center/learning/run-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error: ${response.status}` }));
        throw new Error(errorData.error || `Failed to run learning cycle (${response.status})`);
      }
      // Only refresh data after successful API response
      await fetchData();
    } catch (err) {
      console.error('Error running learning cycle:', err);
      setError(err.message || 'Failed to run learning cycle. Please try again.');
    } finally {
      setRunning(false);
    }
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error && accuracy.length === 0 && predictions.length === 0 && calibration.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
          <span className="font-medium text-red-800">Error Loading Data</span>
        </div>
        <p className="text-red-700">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with action button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <AcademicCapIcon className="h-6 w-6 text-indigo-600" />
            AI Learning Loop
          </h2>
          <p className="text-sm text-neutral-500">Track and improve AI prediction accuracy</p>
        </div>
        <button
          onClick={handleRunLearning}
          disabled={running}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {running ? 'Processing...' : 'Run Learning Loop'}
        </button>
      </div>

      {/* Error banner (non-blocking) */}
      {error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center justify-between">
          <p className="text-yellow-700 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-yellow-600 hover:text-yellow-800 text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Accuracy Summary */}
      {accuracy.length === 0 ? (
        <div className="bg-neutral-50 rounded-lg p-6 text-center text-neutral-500">
          <ChartBarIcon className="h-8 w-8 mx-auto mb-2 text-neutral-400" />
          <p>No accuracy data available yet.</p>
          <p className="text-sm mt-1">Run the learning loop to start tracking predictions.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accuracy.map((item, index) => {
            const avgAccuracy = safeParseFloat(item.avg_accuracy);
            const totalPredictions = parseInt(item.total_predictions, 10) || 0;
            const minAccuracy = safeParseFloat(item.min_accuracy);
            const maxAccuracy = safeParseFloat(item.max_accuracy);

            return (
              <div
                key={`${item.prediction_type}-${item.platform || 'all'}-${index}`}
                className="bg-white rounded-lg border p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-neutral-500 uppercase tracking-wide">
                      {item.prediction_type?.replace(/_/g, ' ') || 'Unknown'}
                    </p>
                    {item.platform && (
                      <p className="text-xs text-neutral-400">{item.platform}</p>
                    )}
                    <p className="text-2xl font-semibold text-neutral-900 mt-1">
                      {Math.round(avgAccuracy * 100)}%
                    </p>
                    <p className="text-xs text-neutral-500">
                      {totalPredictions} prediction{totalPredictions !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <AccuracyGauge accuracy={avgAccuracy} />
                </div>
                <div className="mt-3 pt-3 border-t text-xs text-neutral-500 flex justify-between">
                  <span>Min: {Math.round(minAccuracy * 100)}%</span>
                  <span>Max: {Math.round(maxAccuracy * 100)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Predictions */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-neutral-900">Recent Predictions vs Actuals</h3>
        </div>
        {predictions.length === 0 ? (
          <div className="p-6 text-center text-neutral-500">
            <p>No predictions recorded yet.</p>
            <p className="text-sm mt-1">Predictions will appear here after campaigns are executed and measured.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-neutral-700">Campaign</th>
                  <th className="px-4 py-3 text-left font-medium text-neutral-700">Type</th>
                  <th className="px-4 py-3 text-right font-medium text-neutral-700">Predicted</th>
                  <th className="px-4 py-3 text-right font-medium text-neutral-700">Actual</th>
                  <th className="px-4 py-3 text-right font-medium text-neutral-700">Variance</th>
                  <th className="px-4 py-3 text-center font-medium text-neutral-700">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {predictions.map((pred, index) => {
                  const variance = safeParseFloat(pred.variance_percent);
                  const accuracyScore = safeParseFloat(pred.accuracy_score);
                  const predictedValue = safeParseFloat(pred.predicted_value);
                  const actualValue = safeParseFloat(pred.actual_value);
                  const isGood = Math.abs(variance) <= 20;

                  return (
                    <tr key={pred.id || index} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 text-neutral-900">
                        {pred.draft_name || 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="uppercase text-xs text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded">
                          {pred.prediction_type?.replace(/_/g, ' ') || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-neutral-700">
                        {predictedValue.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-neutral-700">
                        {actualValue.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${isGood ? 'text-green-600' : 'text-red-600'}`}>
                        {variance > 0 ? '+' : ''}{variance.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          accuracyScore >= 0.8 ? 'bg-green-100 text-green-700' :
                          accuracyScore >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {Math.round(accuracyScore * 100)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Calibration Data */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-semibold text-neutral-900 mb-2">Confidence Calibration</h3>
        <p className="text-sm text-neutral-500 mb-4">
          Based on historical accuracy, AI confidence scores are adjusted per prediction type.
        </p>
        {calibration.length === 0 ? (
          <div className="text-center text-neutral-500 py-6 bg-neutral-50 rounded-lg">
            <p>No calibration data available yet.</p>
            <p className="text-sm mt-1">Calibrations are computed after sufficient predictions are recorded.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {calibration.map((cal, index) => {
              const confidenceAdj = safeParseFloat(cal.confidence_adjustment, 1);
              const sampleSize = parseInt(cal.sample_size, 10) || 0;
              const meanAccuracy = safeParseFloat(cal.mean_accuracy);

              return (
                <div
                  key={`${cal.prediction_type}-${cal.platform || 'all'}-${index}`}
                  className="p-3 bg-neutral-50 rounded-lg"
                >
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">
                    {cal.prediction_type?.replace(/_/g, ' ') || 'Unknown'}
                  </p>
                  {cal.platform && (
                    <p className="text-xs text-neutral-400">{cal.platform}</p>
                  )}
                  <p className={`text-lg font-semibold mt-1 ${
                    confidenceAdj >= 1.1 ? 'text-green-600' :
                    confidenceAdj <= 0.8 ? 'text-red-600' :
                    'text-neutral-900'
                  }`}>
                    {confidenceAdj.toFixed(2)}x
                  </p>
                  <div className="mt-2 text-xs text-neutral-500 space-y-0.5">
                    <p>Mean accuracy: {Math.round(meanAccuracy * 100)}%</p>
                    <p>{sampleSize} sample{sampleSize !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
