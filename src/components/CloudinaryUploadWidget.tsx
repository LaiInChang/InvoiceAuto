import { CldUploadButton } from 'next-cloudinary';

interface CloudinaryUploadWidgetProps {
  onSuccess: (result: any) => void;
  onError: (error: any) => void;
}

export const CloudinaryUploadWidget: React.FC<CloudinaryUploadWidgetProps> = ({ onSuccess, onError }) => {
  return (
    <CldUploadButton
      uploadPreset={process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET}
      onSuccess={onSuccess}
      onError={onError}
      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
    >
      Upload Invoice
    </CldUploadButton>
  );
}; 