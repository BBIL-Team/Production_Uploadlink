import React, { useState, useEffect } from 'react';
import './App.css';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');

  const fetchUploadStatus = async () => {
    try {
      const response = await fetch(" https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/Production_Uploadlink");
      if (response.ok) {
        const data = await response.json();
        console.log("API Response:", data);
        setUploadStatus(data);
      } else {
        console.error("Failed to fetch upload status, status:", response.status);
      }
    } catch (error) {
      console.error("Error fetching upload status:", error);
    }
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
  const uploadFile = async (file: File | null, apiUrl: string) => {
    if (!file) {
      alert("Please select a CSV file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setResponseMessage(data.message || "File uploaded successfully!");
      } else {
        const errorText = await response.text();
        setResponseMessage(`Failed to upload file: ${errorText}`);
      }
    } catch (error) {
      console.error("Error:", error);
      setResponseMessage("An error occurred while uploading the file.");
    }

     return (
    <div style={{ padding: '2rem' }}>
      <h1>Upload CSV File</h1>
      <input type="file" accept=".csv" onChange={handleFileChange} />
      <br /><br />
      <button onClick={handleSubmit}>Submit</button>
      <br /><br />
      <p>{message}</p>
    </div>
  );
};

export default App;
