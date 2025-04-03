'use client'

import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { Button, Box } from '@mui/material'
import { CalendarIcon } from '@heroicons/react/24/outline'

interface DateRangeFilterProps {
  startDate: Date | null
  endDate: Date | null
  onStartDateChange: (date: Date | null) => void
  onEndDateChange: (date: Date | null) => void
  onClear: () => void
}

export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear
}: DateRangeFilterProps) {
  return (
    <div className="bg-white shadow rounded-lg p-4 mb-4">
      <div className="flex items-center gap-4">
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <div className="flex items-center gap-4">
            <DatePicker
              label="Start Date"
              value={startDate}
              onChange={onStartDateChange}
              slotProps={{ 
                textField: { 
                  size: "small",
                  sx: { width: '200px' }
                } 
              }}
            />
            <DatePicker
              label="End Date"
              value={endDate}
              onChange={onEndDateChange}
              slotProps={{ 
                textField: { 
                  size: "small",
                  sx: { width: '200px' }
                } 
              }}
            />
          </div>
        </LocalizationProvider>
        {(startDate || endDate) && (
          <Button
            variant="outlined"
            size="small"
            onClick={onClear}
            className="ml-auto"
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  )
} 