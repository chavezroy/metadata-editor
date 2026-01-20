'use client';

import { useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';
import { useStore } from '@/store/useStore';

interface NotificationModalProps {
  isOpen: boolean;
  type: 'success' | 'error';
  title: string;
  message: string;
  onClose: () => void;
}

export function NotificationModal({
  isOpen,
  type,
  title,
  message,
  onClose,
}: NotificationModalProps): React.ReactElement | null {
  const { ui } = useStore();

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const Icon = type === 'success' ? CheckCircle : XCircle;
  const iconColor = type === 'success' ? '#10b981' : '#ef4444';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 transition-opacity"
        onClick={onClose}
        style={{ animation: 'fadeIn 0.2s ease-out' }}
      />

      {/* Modal */}
      <div
        className="fixed left-4 right-4 top-1/2 -translate-y-1/2 z-50 p-6 shadow-2xl md:left-1/2 md:right-auto md:-translate-x-1/2 md:min-w-[400px] md:max-w-md"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: `${ui.borderRadius}px`,
          border: '1px solid var(--color-secondary)',
          animation: 'slideIn 0.3s ease-out',
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          style={{ color: 'var(--color-secondary)' }}
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-1">
            <Icon size={24} color={iconColor} />
          </div>

          <div className="flex-1">
            <h3
              className="text-lg font-semibold mb-1"
              style={{ color: 'var(--color-font)' }}
            >
              {title}
            </h3>
            <p
              className="text-sm"
              style={{ color: 'var(--color-secondary)' }}
            >
              {message}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div
          className="mt-4 h-1 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--color-background)' }}
        >
          <div
            className="h-full"
            style={{
              backgroundColor: iconColor,
              animation: 'progressBar 3s linear forwards',
            }}
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-48%) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(-50%) scale(1);
          }
        }

        @media (min-width: 768px) {
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translate(-50%, -48%) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translate(-50%, -50%) scale(1);
            }
          }
        }

        @keyframes progressBar {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </>
  );
}
