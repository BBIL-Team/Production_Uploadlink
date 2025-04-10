import React, { useState, useEffect } from 'react';
import { Auth } from 'aws-amplify'; // Import Amplify Auth
import './App.css';

const App: React.FC = () => {
  const [responseMessage, setResponseMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null); // Store user's email
  const [isAuthenticated, setIsAuthenticated] = useState(false); // Track auth status

  const apiUrl = "https://nkxcgcfsj6.execute-api.ap-south-1.amazonaws.com/P2/Production_Uploadlink";

  // Check authentication status on mount
  useEffect(() => {
    const checkUser = async () => {
      try {
        const user = await Auth.currentAuthenticatedUser();
        setUserEmail(user.attributes.email); // Get email from user attributes
        setIsAuthenticated(true);
      } catch (error) {
        console.log('No user logged in:', error);
        setIsAuthenticated(false);
        setResponseMessage('Please log in to upload files.');
      }
    };
    checkUser();
  }, []);

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setResponseMessage(''); // Clear previous response
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

    if (!isAuthenticated || !userEmail) {
      setResponseMessage('You must be logged in to upload files.');
      return;
    }

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64String = (reader.result as string).split(',')[1]; // Remove "data:text/csv;base64," prefix

        const payload = {
          body: base64String,
          isBase64Encoded: true,
        };

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-filename': file.name,      // Original filename
            'x-user-email': userEmail,    // Add user's email
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

  // Simple login/logout UI
  const handleLogin = async () => {
    try {
      await Auth.signIn('user@example.com', 'password'); // Replace with actual login flow
      const user = await Auth.currentAuthenticatedUser();
      setUserEmail(user.attributes.email);
      setIsAuthenticated(true);
      setResponseMessage('');
    } catch (error) {
      console.error('Login Error:', error);
      setResponseMessage('Login failed. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await Auth.signOut();
      setUserEmail(null);
      setIsAuthenticated(false);
      setResponseMessage('Logged out successfully.');
    } catch (error) {
      console.error('Logout Error:', error);
      setResponseMessage('Logout failed.');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Upload CSV to API Gateway</h1>
      {isAuthenticated ? (
        <>
          <p>Logged in as: {userEmail}</p>
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
          <button onClick={handleLogout} style={{ marginLeft: '1rem' }}>
            Logout
          </button>
          <br /><br />
          {responseMessage && (
            <div>
              <h3>API Response:</h3>
              <p>{responseMessage}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <p>Please log in to upload files.</p>
          <button onClick={handleLogin}>Login</button> {/* Replace with actual login UI */}
          <br /><br />
          {responseMessage && <p>{responseMessage}</p>}
        </>
      )}
    </div>
  );
};

export default App;
