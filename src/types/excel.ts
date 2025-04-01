export interface ExcelColumn {
  id: keyof ExcelRow;
  label: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
}

export interface ExcelRow {
  no: number;
  quarter: string;
  year: string;
  month: number;
  date: number;
  invoiceNumber: string;
  category: string;
  supplier: string;
  description: string;
  vatRegion: string;
  currency: string;
  amountInclVat: string;
  vatPercentage: string;
  amountExVat: string;
  vat: string;
} 