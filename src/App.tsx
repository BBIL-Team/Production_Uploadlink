import { Storage, API } from 'aws-amplify';
import { useState } from 'react';
import { AuthUser, useAuthenticator } from '@aws-amplify/ui-react-native';

export default function UploadFile() {
  const { user } = useAuthenticator((context) => [context.user]);
  const [file, setFile] = useState<File | null>(null);

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  // Upload file to S3 and log in DynamoDB
  const uploadFile = async () => {
    if (!file || !user) return alert('No file selected or user not logged in');

    try {
      // Upload to S3
      const fileKey = `${user.username}/${file.name}`;
      await Storage.put(fileKey, file);

      // Save metadata in DynamoDB
      const uploadDetails = {
        user_id: user.username,
        file_name: file.name,
        upload_time: new Date().toISOString(),
      };

      await API.post('myApiName', '/saveUploadDetails', { body: uploadDetails });

      alert('File uploaded and recorded successfully!');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('File upload failed');
    }
  };

  return (
    <div>
      <h2>Upload File</h2>
      <input type="file" onChange={handleFileChange} />
      <button onClick={uploadFile} disabled={!file}>Upload</button>
    </div>
  );
}
