import { useState, useEffect, useRef } from 'react';

interface Log {
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success';
}

export default function DebugPanel() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg"
      >
        {isVisible ? 'Hide Debug' : 'Show Debug'}
      </button>

      {isVisible && (
        <div className="mt-2 bg-white rounded-lg shadow-xl p-4 w-96 max-h-96 overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Debug Panel</h3>
            <button
              onClick={clearLogs}
              className="text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
          
          <div className="overflow-y-auto max-h-80">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`mb-2 p-2 rounded ${
                  log.type === 'error'
                    ? 'bg-red-100 text-red-800'
                    : log.type === 'success'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <div className="text-xs text-gray-500">{log.timestamp}</div>
                <div>{log.message}</div>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
} 