import React, { useState } from 'react';
import './App.css';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');

  const apiUrl = "https://nkxcgcfsj6.execute-api.ap-south-1.amazonaws.com/P2/Production_Uploadlink";

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
  };

  // Validate file type
  const validateFile = (file: File | null): boolean => {
    if (file && file.name.endsWith(".csv")) {
      return true;
    }
    alert("Please upload a valid CSV file.");
    return false;
  };

  // Upload file function
const uploadFile = async () => {
  if (!file || !validateFile(file)) return;

  try {
    // Convert file to base64
    const base64 = await convertToBase64(file);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-filename": file.name,
      },
      body: JSON.stringify({
        body: base64,
        isBase64Encoded: true,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      setMessage(data.message || "File uploaded successfully123!");
    } else {
      const errorText = await response.text();
      setMessage(`Failed to upload file: ${errorText}`);
    }
  } catch (error) {
    console.error("Error uploading file:", error);
    setMessage("An error occurred while uploading the file.");
  }
};

// Helper function to convert file to base64
const convertToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(buffer);
      let binary = '';
      bytes.forEach((b) => (binary += String.fromCharCode(b)));
      const base64 = btoa(binary);
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};



  return (
    <div style={{ padding: '2rem' }}>
      <h1>Upload CSV File</h1>
      <input type="file" accept=".csv" onChange={handleFileChange} />
      <br /><br />
      <button onClick={uploadFile}>Submit</button>
      <br /><br />
      <p>{message}</p>
    </div>
  );
};

export default App;
