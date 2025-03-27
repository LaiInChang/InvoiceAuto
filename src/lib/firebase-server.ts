import { database as adminDatabase } from './firebase-admin'
import { ProcessingStatus, BatchStatus } from './firebase-realtime'

export async function updateFileStatus(fileUrl: string, status: ProcessingStatus) {
  try {
    const statusRef = adminDatabase.ref(`processing/${encodeURIComponent(fileUrl)}`)
    await statusRef.set(status)
  } catch (error) {
    console.error('Error updating file status:', error)
    throw error
  }
}

export async function updateBatchStatus(batchNumber: number, status: BatchStatus) {
  try {
    const batchRef = adminDatabase.ref(`batches/${batchNumber}`)
    await batchRef.set(status)
  } catch (error) {
    console.error('Error updating batch status:', error)
    throw error
  }
}

export async function clearProcessingStatuses() {
  try {
    const processingRef = adminDatabase.ref('processing')
    await processingRef.remove()
  } catch (error) {
    console.error('Error clearing processing statuses:', error)
    throw error
  }
} 