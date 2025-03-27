export interface Invoice {
  InvoiceYear?: string;
  InvoiceQuarter?: string;
  InvoiceMonth?: string;
  InvoiceDate?: string;
  InvoiceNumber?: string;
  Category?: string;
  Supplier?: string;
  Description?: string;
  VATRegion?: string;
  Currency?: string;
  AmountInclVAT?: number;
  AmountExVAT?: number;
  VAT?: number;
  fileUrl?: string;
  fileName?: string;
  status?: 'Pending' | 'Processing' | 'Processed' | 'Error' | 'Failed';
  error?: string;
} 