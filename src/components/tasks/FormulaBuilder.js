import React, { useState } from 'react';
import { CodeBracketIcon, CalculatorIcon, AcademicCapIcon } from '@heroicons/react/24/outline';

const FORMULA_FUNCTIONS = [
  { name: 'SUM', description: 'Sum of values', example: 'SUM(field1, field2)' },
  { name: 'AVG', description: 'Average of values', example: 'AVG(field1, field2)' },
  { name: 'COUNT', description: 'Count of values', example: 'COUNT(field1, field2)' },
  { name: 'MIN', description: 'Minimum value', example: 'MIN(field1, field2)' },
  { name: 'MAX', description: 'Maximum value', example: 'MAX(field1, field2)' },
  { name: 'IF', description: 'Conditional', example: 'IF(field1 > 10, "High", "Low")' },
  { name: 'CONCAT', description: 'Concatenate text', example: 'CONCAT(field1, " - ", field2)' }
];

export default function FormulaBuilder({ 
  formula, 
  onFormulaChange, 
  availableFields = [],
  onValidate
}) {
  const [showExamples, setShowExamples] = useState(false);
  const [error, setError] = useState(null);

  const handleFormulaChange = (newFormula) => {
    onFormulaChange(newFormula);
    setError(null);
    
    if (onValidate) {
      const validation = validateFormula(newFormula, availableFields);
      if (!validation.valid) {
        setError(validation.error);
      }
    }
  };

  const validateFormula = (formula, fields) => {
    if (!formula || !formula.trim()) {
      return { valid: false, error: 'Formula cannot be empty' };
    }

    // Simple validation - check for field references
    const fieldNames = fields.map(f => f.name || f.id);
    const fieldRefs = formula.match(/\b\w+\b/g) || [];
    
    const invalidRefs = fieldRefs.filter(ref => {
      // Skip function names and numbers
      if (FORMULA_FUNCTIONS.some(f => f.name === ref)) return false;
      if (!isNaN(ref)) return false;
      // Check if it's a valid field name
      return !fieldNames.some(name => name.toLowerCase() === ref.toLowerCase());
    });

    if (invalidRefs.length > 0) {
      return { valid: false, error: `Unknown field references: ${invalidRefs.join(', ')}` };
    }

    return { valid: true };
  };

  const insertFunction = (funcName) => {
    const currentFormula = formula || '';
    const newFormula = currentFormula + (currentFormula ? ' + ' : '') + funcName + '()';
    handleFormulaChange(newFormula);
  };

  const insertField = (fieldName) => {
    const currentFormula = formula || '';
    const newFormula = currentFormula + (currentFormula ? ' + ' : '') + fieldName;
    handleFormulaChange(newFormula);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-2">
          Formula Expression
        </label>
        <div className="relative">
          <textarea
            value={formula || ''}
            onChange={(e) => handleFormulaChange(e.target.value)}
            placeholder="Enter formula (e.g., SUM(field1, field2) or field1 + field2)"
            rows={3}
            className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-purple focus:border-brand-purple ${
              error ? 'border-red-300' : 'border-neutral-300'
            }`}
          />
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Use field names in formulas. Supported functions: SUM, AVG, COUNT, MIN, MAX, IF, CONCAT
        </p>
      </div>

      {/* Available Fields */}
      {availableFields.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">Available Fields</label>
          <div className="flex flex-wrap gap-2">
            {availableFields.map((field) => (
              <button
                key={field.id}
                type="button"
                onClick={() => insertField(field.name)}
                className="px-2 py-1 text-xs bg-neutral-100 text-neutral-700 rounded hover:bg-neutral-200 transition-colors"
                title={`Click to insert ${field.name}`}
              >
                {field.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Functions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-neutral-700">Functions</label>
          <button
            type="button"
            onClick={() => setShowExamples(!showExamples)}
            className="flex items-center gap-1 text-xs text-brand-purple hover:text-brand-navy"
          >
            <AcademicCapIcon className="h-4 w-4" />
            {showExamples ? 'Hide' : 'Show'} Examples
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FORMULA_FUNCTIONS.map((func) => (
            <button
              key={func.name}
              type="button"
              onClick={() => insertFunction(func.name)}
              className="p-2 text-left border border-neutral-200 rounded-lg hover:border-brand-purple hover:bg-brand-purple/5 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <CodeBracketIcon className="h-4 w-4 text-brand-purple" />
                <span className="text-sm font-medium text-neutral-900">{func.name}</span>
              </div>
              <p className="text-xs text-neutral-500">{func.description}</p>
              {showExamples && (
                <p className="text-xs text-neutral-400 mt-1 font-mono">{func.example}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Formula Examples */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">Formula Examples</h4>
        <div className="space-y-2 text-xs text-blue-800">
          <div>
            <code className="font-mono">SUM(Revenue, Expenses)</code>
            <span className="ml-2 text-blue-600">- Add two number fields</span>
          </div>
          <div>
            <code className="font-mono">AVG(Score1, Score2, Score3)</code>
            <span className="ml-2 text-blue-600">- Calculate average</span>
          </div>
          <div>
            <code className="font-mono">IF(Priority = "urgent", "High", "Normal")</code>
            <span className="ml-2 text-blue-600">- Conditional logic</span>
          </div>
          <div>
            <code className="font-mono">CONCAT(FirstName, " ", LastName)</code>
            <span className="ml-2 text-blue-600">- Combine text fields</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Formula calculation engine (simplified)
export function calculateFormula(formula, fieldValues, availableFields) {
  if (!formula || !formula.trim()) {
    return null;
  }

  try {
    // Replace field names with their values
    let expression = formula;
    availableFields.forEach(field => {
      const fieldValue = fieldValues[field.id];
      if (fieldValue !== null && fieldValue !== undefined) {
        const value = typeof fieldValue === 'number' ? fieldValue : `"${fieldValue}"`;
        expression = expression.replace(new RegExp(`\\b${field.name}\\b`, 'gi'), value);
      }
    });

    // Simple evaluation (in production, use a proper expression parser)
    // This is a simplified version - for production, consider using a library like math.js
    const result = eval(expression);
    return typeof result === 'number' ? result : String(result);
  } catch (error) {
    console.error('Formula calculation error:', error);
    return null;
  }
}
