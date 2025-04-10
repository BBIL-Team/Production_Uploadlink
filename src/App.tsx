import React, { useState } from 'react';
import './App.css';

const App: React.FC = () => {
  const [responseMessage, setResponseMessage] = useState('');

  const apiUrl = "https://nkxcgcfsj6.execute-api.ap-south-1.amazonaws.com/P2/Production_Uploadlink";

  // Exact JSON data from your input
  const requestData = {
    body: "TmFtZSxBZ2UsQ2l0eQpKb2huIERvZSwzMCxOZXcgWW9ySwpKYW5lIFNtaXRoLDI1LExvbmRvbgpCb2IgSm9obnNvbiwzNSxQYXJpcw==",
    headers: {
      "x-filename": "test_file.csv"
    },
    isBase64Encoded: true
  };

  // Handle API call
  const sendData = async () => {
    try {
      const payload = {
        body: requestData.body,
        isBase64Encoded: requestData.isBase64Encoded
      };

      console.log('Request Payload:', JSON.stringify(payload));
      console.log('Headers:', {
        'Content-Type': 'application/json',
        'x-filename': requestData.headers["x-filename"]
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-filename': requestData.headers["x-filename"],
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text(); // Get raw response first
      console.log('Raw Response:', responseText);

      const data = JSON.parse(responseText); // Parse JSON
      console.log('Parsed Response:', data);

      if (data.message) {
        setResponseMessage(data.message);
      } else {
        setResponseMessage(response.ok ? 'Request succeeded but no message returned' : `Request failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error sending data:', error);
      setResponseMessage('An error occurred while contacting the API.');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Send Data to API Gateway</h1>
      <button onClick={sendData}>Send Sample Data</button>
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
