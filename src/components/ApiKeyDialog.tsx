import { useState } from 'react';
import { Key, LogOut, Loader2, AlertCircle } from 'lucide-react';
import { validateToken } from '../api/ynab';

interface ApiKeyDialogProps {
  apiKey: string | null;
  onConnect: (key: string) => void;
  onDisconnect: () => void;
}

export function ApiKeyDialog({ apiKey, onConnect, onDisconnect }: ApiKeyDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setError('Please enter your API token.');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const valid = await validateToken(trimmed);
      if (valid) {
        onConnect(trimmed);
        setInputValue('');
        setIsOpen(false);
      } else {
        setError('Invalid token. Please check and try again.');
      }
    } catch {
      setError('Could not connect to YNAB. Please check your token.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleDisconnect = () => {
    onDisconnect();
    setIsOpen(false);
  };

  const isConnected = !!apiKey;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
          isConnected
            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        <Key className="w-4 h-4" />
        {isConnected ? 'Connected to YNAB' : 'Connect to YNAB'}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setIsOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900 mb-1">
              {isConnected ? 'YNAB Connection' : 'Connect to YNAB'}
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              {isConnected
                ? 'Your YNAB account is connected.'
                : 'Enter your YNAB Personal Access Token to import your budget data.'}
            </p>

            {isConnected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Key className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-800">Connected</p>
                    <p className="text-xs text-emerald-600">Token: ****{apiKey.slice(-4)}</p>
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-2 w-full justify-center px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Personal Access Token
                  </label>
                  <input
                    type="password"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                    placeholder="Paste your token here..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <button
                  onClick={handleConnect}
                  disabled={isValidating}
                  className="flex items-center gap-2 w-full justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    'Connect'
                  )}
                </button>

                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-600">
                    Get your token from{' '}
                    <a
                      href="https://app.ynab.com/settings/developer"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline"
                    >
                      YNAB Developer Settings
                    </a>
                    . Your token is stored locally in your browser and never sent to any server other than YNAB.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
