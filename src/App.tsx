import React, { useState, useEffect } from 'react';
import './App.css';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Auth } from '@aws-amplify'; // Correct import

const App: React.FC = () => {
  const { signOut } = useAuthenticator();
  const [responseMessage, setResponseMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [userEmail, setUserEmail] = useState('Not logged in');

  const apiUrl = "https://nkxcgcfsj6.execute-api.ap-south-1.amazonaws.com/P2/Production_Uploadlink";

  // Fetch user email on mount
  useEffect(() => {
    const fetchUserEmail = async () => {
      try {
        const user = await Auth.currentAuthenticatedUser();
        setUserEmail(user.attributes.email || 'Email not set');
      } catch (error) {
        console.error('Error fetching user:', error);
        setUserEmail('Not logged in');
      }
    };
    fetchUserEmail();
  }, []);

  // Handle file selection
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

  // Handle file upload
  const sendData = async () => {
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
          },
          body: JSON.stringify(payload),
        });

        const responseText = await response.text();
        let data = responseText ? JSON.parse(responseText) : {};
        setResponseMessage(
          data.message ||
            (response.ok ? 'Request succeeded but no message returned' : `Request failed: ${response.statusText}`)
        );
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
    <div style={{ padding: '2rem', position: 'relative' }}>
      {/* Top-right corner email display */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span>{userEmail}</span>
        <button
          style={{ padding: '5px 10px', fontSize: '14px' }}
          onClick={signOut}
        >
          Sign out
        </button>
      </div>

      {/* Main content */}
      <h1>Upload CSV to API Gateway</h1>
      <input
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        style={{ marginBottom: '1rem' }}
      />
      <br />
      <button onClick={sendData} disabled={!file}>
        Upload File
      </button>
      <br />
      <br />
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
