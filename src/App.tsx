import React, { useState } from 'react';
import './App.css';

const App: React.FC = () => {
  const [responseMessage, setResponseMessage] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const apiUrl = "https://nkxcgcfsj6.execute-api.ap-south-1.amazonaws.com/P2/Production_Uploadlink";

  // Sample JSON data provided
  const sampleJson = {
    body: "TmFtZSxBZ2UsQ2l0eQpKb2huIERvZSwzMCxOZXcgWW9ySwpKYW5lIFNtaXRoLDI1LExvbmRvbgpCb2IgSm9obnNvbiwzNSxQYXJpcw==",
    headers: {
      "x-filename": "test_file.csv"
    },
    isBase64Encoded: true
  };

  // Handle CSV file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setCsvFile(file);
    setResponseMessage(''); // Clear message when new file is selected
  };

  // Convert uploaded file to base64
  const fileToBase64 = (file: File): Promise<string> => {
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

  // Handle form submission and API call
  const handleSubmit = async () => {
    try {
      let requestBody;
      let filename = sampleJson.headers["x-filename"];

      // If a file is uploaded, use it; otherwise, use sample JSON body
      if (csvFile) {
        if (!csvFile.name.endsWith('.csv')) {
          setResponseMessage('Please upload a valid CSV file.');
          return;
        }
        const base64 = await fileToBase64(csvFile);
        requestBody = {
          body: base64,
          isBase64Encoded: true
        };
        filename = csvFile.name; // Use uploaded file's name
      } else {
        requestBody = {
          body: sampleJson.body,
          isBase64Encoded: sampleJson.isBase64Encoded
        };
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-filename': filename,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      // Display the API response message if it exists
      if (data.message) {
        setResponseMessage(data.message);
      } else {
        setResponseMessage(response.ok ? 'Request succeeded but no message returned' : `Request failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error making API call:', error);
      setResponseMessage('An error occurred while contacting the API.');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>API Gateway CSV Upload</h1>
      
      <div>
        <label>
          Upload CSV File (optional - uses sample data if no file selected):
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
          />
        </label>
      </div>
      
      <br />
      <button onClick={handleSubmit}>Submit to API</button>
      
      <br /><br />
      {responseMessage && (
        <div>
          <h3>API Response:</h3>
          <p>{responseMessage}</p>
        </div>
      )}
    </div>
  );
};

export default App;
