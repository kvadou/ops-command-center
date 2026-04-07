import React from 'react';
import Modal from './Modal';
import Button from './Button';

export default function AlertDialog({ isOpen, onClose, title, message, onConfirm, confirmLabel, confirmVariant }) {
  const handleConfirm = () => {
    onClose();
    onConfirm?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title || 'Notice'} size="sm">
      <p className="text-sm text-neutral-600 mb-4">{message}</p>
      <div className="flex justify-end gap-2">
        {onConfirm ? (
          <>
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant={confirmVariant || 'danger'} size="sm" onClick={handleConfirm}>{confirmLabel || 'Confirm'}</Button>
          </>
        ) : (
          <Button variant="primary" size="sm" onClick={onClose}>OK</Button>
        )}
      </div>
    </Modal>
  );
}
