import React, { useState } from 'react';
import './App.css';
import { useAuthenticator } from '@aws-amplify/ui-react';

const App: React.FC = () => {
  const { signOut } = useAuthenticator();
  const [file, setFile] = useState<File | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [responseMessage, setResponseMessage] = useState<string>("");

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const validateFile = (file: File | null): boolean => {
    if (file && file.name.endsWith(".csv")) {
      return true;
    }
    alert("Please upload a valid CSV file.");
    return false;
  };

  const uploadFile = async (file: File | null, apiUrl: string) => {
    if (!file) {
      alert("Please select a CSV file to upload.");
      return;
    }

    if (!selectedMonth) {
      alert("Please select a month before uploading.");
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('month', selectedMonth);

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
  };

  return (
    <div style={{ height: '100vh', overflowY: 'auto', backgroundColor: '#f8f8ff' }}>
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
        <header style={{ width: '100%', backgroundColor: '#008080', display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '130px', height: '90px', overflow: 'hidden', borderRadius: '8px' }}>
            <img
              style={{ padding: '10px', width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 50%' }}
              src="https://www.bharatbiotech.com/images/bharat-biotech-logo.jpg"
              alt="Company Logo"
              className="logo"
            />
          </div>
          <button style={{ marginLeft: 'auto', marginRight: '20px' }} onClick={signOut}>
            Sign out
          </button>
        </header>

        <h1 style={{ padding: '10px', textAlign: 'center', width: '100%' }}>
          <u>BBIL Production-Upload Interface</u>
        </h1>

        {/* Upload + Download Section Side-by-Side */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: '20px',
            width: '100%',
            padding: '20px'
          }}
        >
          {/* Upload Section */}
          <div style={{ flex: '1', minWidth: '300px', backgroundColor: '#f0f0f0', padding: '20px', borderRadius: '10px' }}>
            <h2>Upload File</h2>
            <div
              style={{
                backgroundColor: '#e6e6e6',
                borderRadius: '8px',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                <option value="">Select Month</option>
                {months.map((month) => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (validateFile(file)) {
                    uploadFile(file, "https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/Production_Uploadlink");
                  }
                }}
              >
                Submit File
              </button>
            </div>
            {responseMessage && (
              <p style={{ marginTop: '10px', color: 'green' }}>{responseMessage}</p>
            )}
          </div>

          {/* Download Sample Files Section */}
          <div style={{ flex: '1', minWidth: '300px', backgroundColor: '#f0f0f0', padding: '20px', borderRadius: '10px' }}>
            <h2>📥 Download Sample Files (Monthly)</h2>
            <ul style={{ listStyleType: 'none', padding: 0, columns: 1 }}>
              {months.map((month) => (
                <li key={month} style={{ marginBottom: '8px' }}>
                  <a
                    href={`https://your-bucket-name.s3.amazonaws.com/sample-files/${month}.xlsx`}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      textDecoration: 'none',
                      color: '#007BFF',
                      backgroundColor: '#e6f2ff',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      display: 'inline-block'
                    }}
                  >
                    {month} Sample Excel
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
