export interface ExcelColumn {
  id: string;
  label: string;
  minWidth?: number;
  maxWidth?: number;
}

export interface ExcelRow {
  [key: string]: any;
} 