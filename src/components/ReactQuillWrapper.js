import React, { useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

// Suppress the findDOMNode deprecation warning from ReactQuill
// This is a known issue with ReactQuill and React 18's StrictMode
// The functionality works correctly despite the warning
// Set up suppression immediately when module loads to catch warnings during render
let warningSuppressionActive = false;

// Set up warning suppression immediately when module loads
if (!warningSuppressionActive) {
  warningSuppressionActive = true;

  const originalError = console.error;
  const originalWarn = console.warn;
  const originalDebug = console.debug;

  const shouldSuppress = (arg) => {
    // Handle string messages
    if (typeof arg === 'string') {
      const lowerArg = arg.toLowerCase();
      // Suppress ANY findDOMNode warning (ReactQuill is in the stack trace, not always in the message)
      // Also suppress DOMNodeInserted deprecation warnings from Quill
      // Use simple keyword matching to catch all variations
      return (
        lowerArg.includes('finddomnode') ||
        lowerArg.includes('domnodeinserted') ||
        lowerArg.includes('mutation event') ||
        lowerArg.includes('listener added for a') ||
        lowerArg.includes('download the react devtools') ||
        lowerArg.includes('react devtools') ||
        lowerArg.includes('deprecation') ||
        lowerArg.includes('support for this event type has been removed') ||
        lowerArg.includes('chromestatus.com/feature/5083947249172480') ||
        lowerArg.includes('listener added for a \'domnodeinserted\'')
      );
    }
    // Handle object messages (React sometimes logs warnings as objects)
    if (typeof arg === 'object' && arg !== null) {
      try {
        const messageStr = JSON.stringify(arg);
        const lowerStr = messageStr.toLowerCase();
        return (
          (messageStr.includes('findDOMNode') && messageStr.includes('ReactQuill')) ||
          (messageStr.includes('DOMNodeInserted')) ||
          (lowerStr.includes('react devtools')) ||
          (messageStr.includes('findDOMNode is deprecated'))
        );
      } catch (e) {
        // If stringify fails, try toString
        const str = String(arg);
        return (
          str.includes('findDOMNode') ||
          str.includes('DOMNodeInserted') ||
          str.toLowerCase().includes('react devtools')
        );
      }
    }
    // Handle other types by converting to string
    try {
      const str = String(arg);
      return (
        str.includes('findDOMNode') ||
        str.includes('DOMNodeInserted') ||
        str.toLowerCase().includes('react devtools')
      );
    } catch (e) {
      return false;
    }
  };

  const checkAndSuppress = (args) => {
    // Check all arguments, including stack traces
    // Join all args into a single string to check the full message including stack traces
    const fullMessage = args.map(arg => {
      if (typeof arg === 'string') {
        return arg;
      }
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }).join(' ');
    
    // Check the full message (including stack traces which contain ReactQuill)
    return shouldSuppress(fullMessage) || args.some(arg => shouldSuppress(arg));
  };

  console.error = (...args) => {
    if (!checkAndSuppress(args)) {
      originalError.apply(console, args);
    }
  };

  console.warn = (...args) => {
    if (!checkAndSuppress(args)) {
      originalWarn.apply(console, args);
    }
  };

  console.debug = (...args) => {
    if (!checkAndSuppress(args)) {
      originalDebug.apply(console, args);
    }
  };
}

/**
 * Wrapper component for ReactQuill that suppresses the findDOMNode deprecation warning.
 * This warning is a known issue with ReactQuill and React 18's StrictMode.
 * The functionality works correctly despite the warning.
 */
const ReactQuillWrapper = React.forwardRef(({ value, onChange, modules, formats, ...props }, ref) => {
  const quillRef = useRef(null);

  // Expose the internal ref to parent via forwarded ref
  React.useImperativeHandle(ref, () => quillRef.current, []);

  return (
    <ReactQuill
      ref={quillRef}
      value={value}
      onChange={onChange}
      modules={modules}
      formats={formats}
      {...props}
    />
  );
});

export default ReactQuillWrapper;

