import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';

export default function PromptDialog({ isOpen, onClose, onSubmit, title, message, placeholder, defaultValue = '', submitText = 'Submit', cancelText = 'Cancel' }) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) setValue(defaultValue);
  }, [isOpen, defaultValue]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(value);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      {message && <p className="text-sm text-neutral-600 mb-4">{message}</p>}
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
          autoFocus
        />
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" size="sm" onClick={onClose} type="button">{cancelText}</Button>
          <Button variant="primary" size="sm" type="submit">{submitText}</Button>
        </div>
      </form>
    </Modal>
  );
}
