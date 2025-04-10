import React, { useState } from 'react';
import { Auth } from 'aws-amplify'; // Fallback import
import { Authenticator } from '@aws-amplify/ui-react'; // For auth UI
import '@aws-amplify/ui-react/styles.css'; // Required for Authenticator styles
import './App.css';

const App: React.FC = () => {
  const [responseMessage, setResponseMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const apiUrl = "https://nkxcgcfsj6.execute-api.ap-south-1.amazonaws.com/P2/Production_Uploadlink";

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setResponseMessage('');
    } else {
      setFile(null);
      setResponseMessage('Please select a valid .csv file.');
    }
  };

  const sendData = async (userEmail: string) => {
    if (!file) {
      setResponseMessage('No file selected. Please choose a .csv file first.');
      return;
    }

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64String = (reader.result as string).split(',')[1];

        const payload = {
          body: base64String,
          isBase64Encoded: true,
        };

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-filename': file.name,
            'x-user-email': userEmail,
          },
          body: JSON.stringify(payload),
        });

        const responseText = await response.text();
        let data = responseText ? JSON.parse(responseText) : {};
        setResponseMessage(data.message || (response.ok ? 'Request succeeded but no message returned' : `Request failed: ${response.statusText}`));
      };
      reader.onerror = () => {
        setResponseMessage('Error reading the file.');
      };
    } catch (error) {
      console.error('Fetch Error:', error);
      setResponseMessage('An error occurred while contacting the API.');
    }
  };

  return (
    <Authenticator>
      {({ signOut, user }) => {
        const userEmail = user?.attributes?.email || 'unknown';
        return (
          <div style={{ padding: '2rem' }}>
            <h1>Upload CSV to API Gateway</h1>
            <p>Logged in as: {userEmail}</p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ marginBottom: '1rem' }}
            />
            <br />
            <button onClick={() => sendData(userEmail)} disabled={!file}>
              Upload File
            </button>
            <button onClick={signOut} style={{ marginLeft: '1rem' }}>
              Sign Out
            </button>
            <br /><br />
            {responseMessage && (
              <div>
                <h3>API Response:</h3>
                <p>{responseMessage}</p>
              </div>
            )}
          </div>
        );
      }}
    </Authenticator>
  );
};

export default App;
