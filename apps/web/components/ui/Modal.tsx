'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const triggerRef = useRef<Element | null>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      triggerRef.current = document.activeElement;
      dialog.showModal();
      // Focus the first focusable element inside the dialog
      const focusable = dialog.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) {
        setTimeout(() => focusable.focus(), 0);
      }
    } else {
      dialog.close();
      // Restore focus to the element that triggered the modal
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
      triggerRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => onCloseRef.current();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="bg-parchment rounded-lg shadow-xl border border-border-light p-0 backdrop:bg-ink/40 max-w-lg w-full"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="p-6">
        <h2
          id="modal-title"
          className="text-lg font-[family-name:var(--font-display)] font-semibold text-ink mb-4"
        >
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
