import React, { useState } from 'react';
import { Auth, API } from 'aws-amplify';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setUploadStatus('Please select a file first');
      return;
    }

    try {
      setUploadStatus('Uploading...');

      // Get current authenticated user
      const user = await Auth.currentAuthenticatedUser();
      const userId: string = user.attributes.sub;

      // Generate unique file name and get metadata
      const fileName: string = `${Date.now()}-${file.name}`;
      const fileSize: number = file.size;
      const uploadTime: string = new Date().toISOString();

      // Read file content as buffer
      const fileReader = new FileReader();
      const fileContent = await new Promise<string>((resolve) => {
        fileReader.onload = () => resolve(fileReader.result as string);
        fileReader.readAsDataURL(file); // Returns base64 with data URI prefix
      });

      // Extract base64 content (remove data URI prefix)
      const base64Content = fileContent.split(',')[1];

      // Send file and metadata to Lambda
      const response = await API.post('YourApiName', '/upload-file', {
        body: {
          userId,
          fileName,
          fileSize,
          uploadTime,
          fileContent: base64Content,
          contentType: file.type,
        },
      });

      setUploadStatus(`File ${fileName} uploaded successfully at ${uploadTime}`);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('Upload failed');
    }
  };

  return (
    <div>
      <h1>File Upload</h1>
      <input type="file" onChange={handleFileChange} />
      <button onClick={handleUpload}>Upload File</button>
      <p>{uploadStatus}</p>
    </div>
  );
};

export default App;
