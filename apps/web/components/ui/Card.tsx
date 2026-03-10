import type { ReactNode } from 'react';

interface CardProps {
  className?: string;
  children: ReactNode;
}

export function Card({ className = '', children }: CardProps) {
  return (
    <div className={`bg-parchment-warm border border-border-light rounded-lg p-6 ${className}`}>
      {children}
    </div>
  );
}
