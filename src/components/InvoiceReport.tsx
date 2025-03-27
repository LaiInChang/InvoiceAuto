import { Invoice } from '@/types/invoice';

interface InvoiceReportProps {
  invoices: Invoice[];
}

export const InvoiceReport: React.FC<InvoiceReportProps> = ({ invoices }) => {
  const processedInvoices = invoices.filter(inv => inv.status === 'Processed');
  const failedInvoices = invoices.filter(inv => inv.status === 'Error' || inv.status === 'Failed');

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">Processing Report</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 p-4 rounded">
          <h3 className="text-green-800 font-medium">Successfully Processed</h3>
          <p className="text-2xl font-bold text-green-600">{processedInvoices.length}</p>
        </div>
        <div className="bg-red-50 p-4 rounded">
          <h3 className="text-red-800 font-medium">Failed</h3>
          <p className="text-2xl font-bold text-red-600">{failedInvoices.length}</p>
        </div>
      </div>
      {failedInvoices.length > 0 && (
        <div className="mt-4">
          <h3 className="text-red-800 font-medium mb-2">Failed Invoices</h3>
          <ul className="space-y-2">
            {failedInvoices.map((invoice) => (
              <li key={invoice.fileUrl} className="text-sm text-red-600">
                {invoice.fileName}: {invoice.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}; 