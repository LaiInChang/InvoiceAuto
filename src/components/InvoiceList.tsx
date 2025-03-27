import React from 'react';
import { Invoice } from '@/types/invoice';

interface InvoiceListProps {
  invoices: Invoice[];
  onRemove: (fileId: string) => void;
}

export const InvoiceList: React.FC<InvoiceListProps> = ({ invoices, onRemove }) => {
  return (
    <div className="space-y-2">
      {invoices.map((invoice) => (
        <div key={invoice.fileUrl} className="flex items-center justify-between p-3 bg-gray-50 rounded">
          <div className="flex items-center space-x-3">
            <span className="text-sm text-gray-600">{invoice.fileName}</span>
            <div className="flex flex-col">
              <span className={`px-2 py-1 text-xs rounded ${
                invoice.status === 'Error' 
                  ? 'bg-red-100 text-red-800'
                  : invoice.status === 'Processed'
                  ? 'bg-green-100 text-green-800'
                  : invoice.status === 'Processing'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {invoice.status || 'Ready'}
              </span>
              {invoice.error && (
                <span className="text-xs text-red-600">
                  Error: {invoice.error}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => onRemove(invoice.fileUrl || '')}
            className="text-red-600 hover:text-red-800"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
};

export default InvoiceList; 