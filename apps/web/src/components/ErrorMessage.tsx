import { AlertCircle, RefreshCw, X } from 'lucide-react';

interface ErrorMessageProps {
  title?: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  onDismiss?: () => void;
  type?: 'error' | 'warning' | 'info';
}

const ErrorMessage = ({ 
  title = 'Something went wrong', 
  message, 
  action, 
  onDismiss,
  type = 'error' 
}: ErrorMessageProps) => {
  const typeStyles = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  const iconStyles = {
    error: 'text-red-500',
    warning: 'text-yellow-500',
    info: 'text-blue-500'
  };

  return (
    <div className={`rounded-lg border p-4 ${typeStyles[type]}`}>
      <div className="flex items-start">
        <AlertCircle className={`h-5 w-5 mt-0.5 mr-3 ${iconStyles[type]}`} />
        <div className="flex-1">
          <h3 className="font-semibold mb-1">{title}</h3>
          <p className="text-sm mb-3">{message}</p>
          {action && (
            <button
              onClick={action.onClick}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-current hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {action.label}
            </button>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorMessage;
