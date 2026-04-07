// Utility to safely render any value as a React child
export function safeRender(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    // Handle label objects and other objects
    if (Array.isArray(value)) {
      return value.map((item, idx) => safeRender(item)).filter(Boolean).join(', ');
    }
    // Handle label objects specifically (they have id, name, category_id, category_name, custom_to_branch)
    if (value.name) return value.name;
    if (value.id) return String(value.id);
    if (value.machine_name) return value.machine_name;
    // Fallback to JSON stringify for other objects
    try {
      return JSON.stringify(value);
    } catch (e) {
      return '[Object]';
    }
  }
  return String(value);
}

// Higher-order component to wrap text content
export function SafeText({ children, fallback = '' }) {
  if (children === null || children === undefined) return fallback;
  if (typeof children === 'string') return children;
  if (typeof children === 'number' || typeof children === 'boolean') return String(children);
  if (typeof children === 'object') {
    if (Array.isArray(children)) {
      return children.map((item, idx) => safeRender(item)).join(', ');
    }
    return children.name || children.id || JSON.stringify(children);
  }
  return String(children);
}

