import { storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { cloudinary } from './cloudinary';

export interface UploadProgress {
  progress: number;
  downloadUrl?: string;
  error?: string;
}

export const validateFile = (file: File) => {
  // Check file type
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type. Only PDF, JPEG, and PNG files are allowed.');
  }

  // Check file size (10MB limit)
  const maxSize = 10 * 1024 * 1024; // 10MB in bytes
  if (file.size > maxSize) {
    throw new Error('File size too large. Maximum size is 10MB.');
  }

  return true;
};

export const uploadToFirebase = async (
  file: File,
  userId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> => {
  try {
    const timestamp = Date.now();
    const fileName = `${userId}/${timestamp}-${file.name}`;
    const storageRef = ref(storage, `invoices/${fileName}`);

    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress?.({ progress });
        },
        (error) => {
          onProgress?.({ progress: 0, error: error.message });
          reject(error);
        },
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          onProgress?.({ progress: 100, downloadUrl });
          resolve(downloadUrl);
        }
      );
    });
  } catch (error) {
    onProgress?.({ progress: 0, error: (error as Error).message });
    throw error;
  }
};

export const uploadToCloudinary = async (
  file: File,
  userId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'invoices');
    formData.append('folder', `invoices/${userId}`);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    onProgress?.({ progress: 100, downloadUrl: data.secure_url });
    return data.secure_url;
  } catch (error) {
    onProgress?.({ progress: 0, error: (error as Error).message });
    throw error;
  }
};

export const validateBatchSize = (files: FileList | File[]) => {
  const maxBatchSize = 30;
  if (files.length > maxBatchSize) {
    throw new Error(`Maximum batch size is ${maxBatchSize} files.`);
  }
  return true;
}; 