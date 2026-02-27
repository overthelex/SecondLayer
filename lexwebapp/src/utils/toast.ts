/**
 * Toast Notification Utility
 * Wrapper around react-hot-toast with claude theme styling
 */

import toast from 'react-hot-toast';
import React from 'react';

const baseStyle = {
  fontFamily: 'Inter, sans-serif',
  fontSize: '14px',
  borderRadius: '12px',
  padding: '14px 16px',
  color: '#2D2D2D',
  background: '#FFFFFF',
  border: '1px solid #E5E5E0',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
};

export const showToast = {
  success: (message: string, duration = 3000) => {
    return toast.success(message, {
      duration,
      style: {
        ...baseStyle,
        borderLeft: '3px solid #4CAF50',
      },
      iconTheme: {
        primary: '#4CAF50',
        secondary: '#FFFFFF',
      },
    });
  },

  error: (message: string, duration = 4000) => {
    return toast.error(message, {
      duration,
      style: {
        ...baseStyle,
        borderLeft: '3px solid #E57373',
      },
      iconTheme: {
        primary: '#E57373',
        secondary: '#FFFFFF',
      },
    });
  },

  info: (message: string, duration = 3000) => {
    return toast(message, {
      duration,
      icon: '\u2139\uFE0F',
      style: {
        ...baseStyle,
        borderLeft: '3px solid #D97757',
      },
    });
  },

  warning: (message: string, duration = 3500) => {
    return toast(message, {
      duration,
      icon: '\u26A0\uFE0F',
      style: {
        ...baseStyle,
        borderLeft: '3px solid #F0A850',
      },
    });
  },

  loading: (message: string) => {
    return toast.loading(message, {
      style: {
        ...baseStyle,
        borderLeft: '3px solid #6B6B6B',
      },
    });
  },

  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string;
      error: string;
    }
  ) => {
    return toast.promise(promise, messages, {
      style: baseStyle,
      success: {
        style: {
          ...baseStyle,
          borderLeft: '3px solid #4CAF50',
        },
        iconTheme: {
          primary: '#4CAF50',
          secondary: '#FFFFFF',
        },
      },
      error: {
        style: {
          ...baseStyle,
          borderLeft: '3px solid #E57373',
        },
        iconTheme: {
          primary: '#E57373',
          secondary: '#FFFFFF',
        },
      },
    });
  },

  undoable: (message: string, onUndo: () => void, duration = 5000) => {
    return toast(
      (t) => React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        React.createElement('span', null, message),
        React.createElement('button', {
          onClick: () => { toast.dismiss(t.id); onUndo(); },
          style: {
            background: 'none',
            border: '1px solid #D97757',
            borderRadius: '6px',
            color: '#D97757',
            cursor: 'pointer',
            padding: '4px 10px',
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap' as const,
          },
        }, '\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438'),
      ),
      {
        duration,
        style: {
          ...baseStyle,
          borderLeft: '3px solid #D97757',
        },
      }
    );
  },

  dismiss: (toastId?: string) => {
    toast.dismiss(toastId);
  },
};

export default showToast;
