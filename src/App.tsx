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
      // Create FormData object and append the file
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "x-filename": file.name, // Send filename in header
        },
        body: formData, // Send file as multipart/form-data
      });

      const responseText = await response.text();
      console.log("Response from Lambda:", responseText); // Debug log

      if (response.ok) {
        const data = JSON.parse(responseText);
        setMessage(data.message || "File uploaded successfully!");
      } else {
        setMessage(`Failed to upload file: ${responseText}`);
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
