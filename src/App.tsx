import React, { useState } from 'react';
import './App.css';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');

  const apiUrl = "https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/Production_Uploadlink";

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
    if (!validateFile(file)) return;

    const formData = new FormData();
    if (file) formData.append('file', file);

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        body: formData,
       headers: {
  "x-filename": file!.name, // 👈 add "!" here
},

      });

      if (response.ok) {
        const data = await response.json();
        setMessage(data.message || "File uploaded successfully!");
      } else {
        const errorText = await response.text();
        setMessage(`Failed to upload file: ${errorText}`);
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      setMessage("An error occurred while uploading the file.");
    }
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
