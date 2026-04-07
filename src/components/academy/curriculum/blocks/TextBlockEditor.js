import React from 'react';
import AcademyRichTextEditor from '../../editor/AcademyRichTextEditor';

export default function TextBlockEditor({ block, onChange, onUpload }) {
  return (
    <div className="space-y-3">
      <input
        type="text"
        value={block.title || ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Section title (optional)"
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
      />
      <AcademyRichTextEditor
        content={block.content || ''}
        onChange={(content) => onChange({ ...block, content })}
        onUpload={onUpload}
        placeholder="Write your content here..."
      />
    </div>
  );
}
