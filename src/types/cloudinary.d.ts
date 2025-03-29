interface CloudinaryUploadWidget {
  open: () => void;
}

interface CloudinaryUploadWidgetOptions {
  cloudName: string;
  uploadPreset: string;
  sources: string[];
  multiple: boolean;
  defaultSource: string;
  clientAllowedFormats: string[];
  maxFileSize: number;
  resourceType: string;
  folder: string;
  singleUploadAutoClose: boolean;
  showUploadMoreButton: boolean;
  showSkipCropButton: boolean;
  styles: {
    palette: {
      window: string;
      windowBorder: string;
      tabIcon: string;
      menuIcons: string;
      textDark: string;
      textLight: string;
      link: string;
      action: string;
      inactiveTabIcon: string;
      error: string;
      inProgress: string;
      complete: string;
      sourceBg: string;
      maxSize: string;
    };
  };
}

interface CloudinaryUploadWidgetCallback {
  (error: any, result: any): void;
}

interface Cloudinary {
  createUploadWidget: (
    options: CloudinaryUploadWidgetOptions,
    callback: CloudinaryUploadWidgetCallback
  ) => CloudinaryUploadWidget;
}

declare global {
  interface Window {
    cloudinary: Cloudinary;
  }
} 