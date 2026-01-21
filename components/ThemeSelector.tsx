'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export function ThemeSelector(): React.ReactElement {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      <button
        onClick={() => setTheme('light')}
        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded transition-colors ${
          theme === 'light'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
        title="Light theme"
      >
        <Sun size={16} />
        <span className="hidden sm:inline">Light</span>
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded transition-colors ${
          theme === 'dark'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
        title="Dark theme"
      >
        <Moon size={16} />
        <span className="hidden sm:inline">Dark</span>
      </button>
      <button
        onClick={() => setTheme('system')}
        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded transition-colors ${
          theme === 'system'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
        title="System theme"
      >
        <Monitor size={16} />
        <span className="hidden sm:inline">System</span>
      </button>
    </div>
  );
}
