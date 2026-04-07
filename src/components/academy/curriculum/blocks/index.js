export { default as TextBlockEditor } from './TextBlockEditor';
export { default as VideoBlockEditor } from './VideoBlockEditor';
export { default as ImageBlockEditor } from './ImageBlockEditor';
export { default as FileBlockEditor } from './FileBlockEditor';
export { default as CalloutBlockEditor } from './CalloutBlockEditor';
export { default as ChecklistBlockEditor } from './ChecklistBlockEditor';
export { default as QuizBlockEditor } from './QuizBlockEditor';

// Block type definitions for the editor
export const BLOCK_TYPES = [
  { type: 'text', label: 'Text', icon: 'DocumentTextIcon', description: 'Rich text content' },
  { type: 'video', label: 'Video', icon: 'PlayCircleIcon', description: 'YouTube or Vimeo' },
  { type: 'image', label: 'Image', icon: 'PhotoIcon', description: 'Upload an image' },
  { type: 'file', label: 'File', icon: 'DocumentIcon', description: 'Downloadable file' },
  { type: 'callout', label: 'Callout', icon: 'LightBulbIcon', description: 'Tip, warning, or note' },
  { type: 'checklist', label: 'Checklist', icon: 'ClipboardDocumentCheckIcon', description: 'Trackable tasks' },
  { type: 'quiz', label: 'Quiz', icon: 'AcademicCapIcon', description: 'Graded assessment' },
];

// Helper to get the editor component for a block type
export function getBlockEditor(type) {
  switch (type) {
    case 'text': return TextBlockEditor;
    case 'video': return VideoBlockEditor;
    case 'image': return ImageBlockEditor;
    case 'file': return FileBlockEditor;
    case 'callout': return CalloutBlockEditor;
    case 'checklist': return ChecklistBlockEditor;
    case 'quiz': return QuizBlockEditor;
    default: return null;
  }
}

// Helper to create a new block with default values
export function createBlock(type) {
  const base = { id: Date.now().toString(), type };

  switch (type) {
    case 'text':
      return { ...base, title: '', content: '' };
    case 'video':
      return { ...base, title: '', url: '', description: '' };
    case 'image':
      return { ...base, url: '', caption: '', alt: '' };
    case 'file':
      return { ...base, title: '', url: '', filename: '', description: '' };
    case 'callout':
      return { ...base, calloutType: 'tip', title: '', content: '' };
    case 'checklist':
      return { ...base, title: '', description: '', items: [] };
    case 'quiz':
      return { ...base, title: '', passingScore: 70, shuffleQuestions: false, showExplanations: true, questions: [] };
    default:
      return base;
  }
}
