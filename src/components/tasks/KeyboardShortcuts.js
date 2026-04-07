import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SHORTCUTS = {
  // Navigation
  'g h': { action: 'navigate', path: '/home', description: 'Go to Home' },
  'g t': { action: 'navigate', path: '/tasks', description: 'Go to Tasks' },
  
  // Task actions
  'n': { action: 'create-task', description: 'Create new task' },
  'f': { action: 'focus-search', description: 'Focus search' },
  '?': { action: 'show-help', description: 'Show keyboard shortcuts' },
  
  // View switching
  'v b': { action: 'switch-view', view: 'board', description: 'Switch to Board view' },
  'v t': { action: 'switch-view', view: 'table', description: 'Switch to Table view' },
  'v c': { action: 'switch-view', view: 'calendar', description: 'Switch to Calendar view' },
  'v l': { action: 'switch-view', view: 'timeline', description: 'Switch to Timeline view' },
  'v d': { action: 'switch-view', view: 'dashboard', description: 'Switch to Dashboard view' },
  
  // Selection
  'a': { action: 'select-all', description: 'Select all tasks' },
  'escape': { action: 'deselect-all', description: 'Deselect all' },
};

export default function KeyboardShortcuts({ 
  onShortcut,
  onNavigate,
  onSwitchView,
  onCreateTask,
  onFocusSearch,
  onSelectAll,
  onDeselectAll
}) {
  const navigate = useNavigate();
  const [pressedKeys, setPressedKeys] = useState(new Set());
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          // Allow escape to work
        } else {
          return;
        }
      }

      const key = e.key.toLowerCase();
      const newPressed = new Set(pressedKeys);
      newPressed.add(key);
      setPressedKeys(newPressed);

      // Check for sequence shortcuts (e.g., 'g' then 'h')
      const sequence = Array.from(newPressed).join(' ');
      
      if (SHORTCUTS[sequence]) {
        const shortcut = SHORTCUTS[sequence];
        handleShortcut(shortcut);
        setPressedKeys(new Set());
        e.preventDefault();
      } else if (SHORTCUTS[key]) {
        const shortcut = SHORTCUTS[key];
        handleShortcut(shortcut);
        setPressedKeys(new Set());
        e.preventDefault();
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      const newPressed = new Set(pressedKeys);
      newPressed.delete(key);
      setPressedKeys(newPressed);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [pressedKeys]);

  const handleShortcut = (shortcut) => {
    switch (shortcut.action) {
      case 'navigate':
        if (onNavigate) {
          onNavigate(shortcut.path);
        } else {
          navigate(shortcut.path);
        }
        break;
      case 'create-task':
        if (onCreateTask) onCreateTask();
        break;
      case 'focus-search':
        if (onFocusSearch) onFocusSearch();
        break;
      case 'switch-view':
        if (onSwitchView) onSwitchView(shortcut.view);
        break;
      case 'select-all':
        if (onSelectAll) onSelectAll();
        break;
      case 'deselect-all':
        if (onDeselectAll) onDeselectAll();
        break;
      case 'show-help':
        setShowHelp(true);
        break;
      default:
        if (onShortcut) onShortcut(shortcut);
    }
  };

  return (
    <>
      {showHelp && (
        <KeyboardShortcutsHelp 
          isOpen={showHelp} 
          onClose={() => setShowHelp(false)} 
        />
      )}
    </>
  );
}

function KeyboardShortcutsHelp({ isOpen, onClose }) {
  if (!isOpen) return null;

  const shortcutsByCategory = {
    'Navigation': Object.entries(SHORTCUTS).filter(([_, s]) => s.action === 'navigate'),
    'Task Actions': Object.entries(SHORTCUTS).filter(([_, s]) => ['create-task', 'focus-search'].includes(s.action)),
    'View Switching': Object.entries(SHORTCUTS).filter(([_, s]) => s.action === 'switch-view'),
    'Selection': Object.entries(SHORTCUTS).filter(([_, s]) => ['select-all', 'deselect-all'].includes(s.action)),
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-neutral-100 text-neutral-500"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-6">
          {Object.entries(shortcutsByCategory).map(([category, shortcuts]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">{category}</h3>
              <div className="space-y-2">
                {shortcuts.map(([keys, shortcut]) => (
                  <div key={keys} className="flex items-center justify-between py-2 border-b border-neutral-100">
                    <span className="text-sm text-neutral-700">{shortcut.description}</span>
                    <kbd className="px-2 py-1 bg-neutral-100 rounded text-xs font-mono text-neutral-900">
                      {keys.split(' ').map((k, i) => (
                        <span key={i}>
                          {i > 0 && ' '}
                          <span className="px-1.5 py-0.5 bg-white border border-neutral-300 rounded shadow-sm">
                            {k === ' ' ? 'Space' : k.toUpperCase()}
                          </span>
                        </span>
                      ))}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { SHORTCUTS };
