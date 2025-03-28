import * as XLSX from 'xlsx'

interface ProcessedData {
  id: string
  invoiceNumber: string
  date: string
  amount: number
  description: string
  category: string
}

export async function generateExcelFile(data: ProcessedData[]): Promise<Blob> {
  // Create a new workbook
  const wb = XLSX.utils.book_new()
  
  // Convert data to worksheet
  const ws = XLSX.utils.json_to_sheet(data.map(item => ({
    'Invoice Number': item.invoiceNumber,
    'Date': item.date,
    'Amount': item.amount,
    'Description': item.description,
    'Category': item.category
  })))

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices')

  // Generate Excel file
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  
  // Convert to Blob
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
} 