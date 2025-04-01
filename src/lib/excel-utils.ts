import ExcelJS from 'exceljs'
import { ExcelColumn, ExcelRow } from '@/types/excel'

export const calculateColumnWidths = (data: ExcelRow[], columns: ExcelColumn[]) => {
  console.log('Calculating column widths for data:', data)
  const widths = columns.map(col => {
    // Get all values for this column
    const values = data.map(row => String(row[col.id] || ''))
    
    // Calculate the maximum width based on actual content
    const contentWidth = Math.max(
      ...values.map(value => {
        // Count characters, considering line breaks
        const lines = value.split('\n')
        return Math.max(...lines.map(line => line.length))
      })
    )

    // Add minimal padding for better readability
    const padding = 1

    // Calculate final width with stricter constraints
    const finalWidth = Math.min(
      Math.max(
        contentWidth + padding,
        col.minWidth || 5  // Minimum width of 5 characters
      ),
      col.maxWidth || 50  // Maximum width of 50 characters
    )

    // Round to 1 decimal place for cleaner numbers
    const roundedWidth = Math.round(finalWidth * 10) / 10

    console.log(`Column ${col.id}: content width = ${contentWidth}, final width = ${roundedWidth}`)
    return roundedWidth
  })
  return widths
}

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