import React, { useState, ChangeEvent } from 'react';
import './App.css';

const App: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedFile(file || null);
    setMessage('');
  };

  const uploadToLambda = async () => {
    if (!selectedFile) {
      alert('Please select a file first.');
      return;
    }

    setUploading(true);
    setMessage('');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/Production_Uploadlink', {
        method: 'POST',
        body: formData,
        headers: {
          'user-id': 'example-user-id-123', // Optional: Replace with actual user ID from auth system
        },
      });

      const result = await response.json();
      setMessage(result.message || 'Upload successful!');
    } catch (error) {
      console.error('Upload error:', error);
      setMessage('Something went wrong during upload.');
    }

    setUploading(false);
  };

  return (
    <div style={styles.container}>
      <h2>Upload File to Lambda</h2>
      <input type="file" onChange={handleFileChange} />
      <br />
      <button onClick={uploadToLambda} disabled={uploading} style={styles.button}>
        {uploading ? 'Uploading...' : 'Upload File'}
      </button>
      {message && <p style={styles.message}>{message}</p>}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: 20,
    fontFamily: 'Arial, sans-serif',
    maxWidth: 400,
    margin: 'auto',
    textAlign: 'center',
    border: '1px solid #ccc',
    borderRadius: 10,
    marginTop: 50,
  },
  button: {
    marginTop: 10,
    padding: '10px 20px',
    cursor: 'pointer',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: 5,
  },
  message: {
    marginTop: 15,
    fontWeight: 'bold',
  },
};

export default App;
