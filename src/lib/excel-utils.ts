import ExcelJS from 'exceljs'
import { ExcelColumn, ExcelRow } from '@/types/excel'

export const generateStyledExcel = async (data: ExcelRow[], columns: ExcelColumn[]) => {
  try {
    console.log('Starting Excel generation with data:', data)
    
    // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Invoice Analysis')

    // Add headers
    const headerRow = worksheet.addRow(columns.map(col => col.label))
    console.log('Added headers:', headerRow.values)

    // Add data rows
    data.forEach((row, index) => {
      const rowData = columns.map(col => row[col.id])
      const excelRow = worksheet.addRow(rowData)
      console.log(`Added row ${index + 1}:`, excelRow.values)
    })

    // Auto-fit columns based on content
    worksheet.columns.forEach(column => {
      column.width = 15 // Set a default width
    })

    // Apply styles to all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        // Apply border styles
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        }

        // Apply alignment
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'left',
          wrapText: true
        }

        // Apply font styles
        cell.font = {
          name: 'Calibri',
          size: 11
        }

        // Apply header styles
        if (rowNumber === 1) {
          cell.font = {
            ...cell.font,
            bold: true
          }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFCCCCCC' }
          }
        }
      })
    })

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()
    console.log('Excel generation completed successfully')
    return new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    })
  } catch (error) {
    console.error('Error generating styled Excel:', error)
    throw error
  }
} 