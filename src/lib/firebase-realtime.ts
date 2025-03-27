// Remove all Firebase imports and functions related to real-time updates

export interface ProcessingStatus {
  status: 'Pending' | 'Processing' | 'Completed' | 'Failed';
  stage?: 'Reading' | 'Azure' | 'GPT4' | 'Complete';
  fileName?: string;
  startTime?: number;
  endTime?: number;
  error?: string;
  data?: any;
  batchNumber?: number;
  totalBatches?: number;
}

export interface BatchStatus {
  batchNumber: number;
  status: 'Pending' | 'Processing' | 'Completed' | 'Failed';
  startTime: number;
  endTime?: number;
  files: string[];
  results: any[];
  failedUrls: { url: string; error: string }[];
}

// Client-side functions
export function subscribeToAllStatuses(callback: (statuses: Record<string, ProcessingStatus> | null) => void) {
  // Remove all Firebase imports and functions related to real-time updates
}

export function subscribeToBatchStatus(batchNumber: number, callback: (status: BatchStatus | null) => void) {
  // Remove all Firebase imports and functions related to real-time updates
}

// Update functions
export async function updateFileStatus(fileUrl: string, status: ProcessingStatus) {
  // Remove all Firebase imports and functions related to real-time updates
}

export async function updateBatchStatus(batchNumber: number, status: BatchStatus) {
  // Remove all Firebase imports and functions related to real-time updates
}

export async function clearProcessingStatuses() {
  // Remove all Firebase imports and functions related to real-time updates
} 