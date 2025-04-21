import React, { useState } from 'react';
import './App.css';
import { useAuthenticator } from '@aws-amplify/ui-react';

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const App: React.FC = () => {
  const { signOut } = useAuthenticator();
  const [file, setFile] = useState<File | null>(null);
  const [responseMessage, setResponseMessage] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(""); // For upload selection
  const [displayedMonth, setDisplayedMonth] = useState<string>(""); // For calendar selection
  const [year, setYear] = useState<number>(2025); // Initial year

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
    alert("Please select the correct month.");
    return;
  }

  try {
    const fileData = await file.arrayBuffer(); // Get binary data
    const base64File = btoa(
      new Uint8Array(fileData)
        .reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    const payload = {
      fileData: base64File,
      filename: file.name,
      month: selectedMonth
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
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

  // Functions to change the year
  const handlePreviousYear = () => setYear((prevYear) => prevYear - 1);
  const handleNextYear = () => setYear((prevYear) => prevYear + 1);

  return (
    <main style={{ width: '100vw', minHeight: '100vh', backgroundColor: '#f8f8ff', overflowX: 'auto' }}>
      <header style={{ width: '100%', backgroundColor: '#008080', display: 'flex', alignItems: 'center', padding: '10px' }}>
        <div style={{ width: '130px', height: '90px', overflow: 'hidden', borderRadius: '8px' }}>
          <img
            style={{ padding: '10px', width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 50%' }}
            src="https://www.bharatbiotech.com/images/bharat-biotech-logo.jpg"
            alt="Company Logo"
            className="logo"
          />
        </div>
        <button style={{ marginLeft: 'auto', marginRight: '20px', padding: '10px 16px', fontSize: '16px' }} onClick={signOut}>
          Sign out
        </button>
      </header>

      <h1 style={{ padding: '10px', textAlign: 'center', width: '100%', fontSize: '28px' }}>
        <u>BBIL Production-Upload Interface</u>
      </h1>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: '20px',
          width: '100%',
          padding: '20px',
          boxSizing: 'border-box'
        }}
      >
        {/* Upload Section */}
        <div style={{
          flex: 2,
          minWidth: '400px',
          backgroundColor: '#f0f0f0',
          padding: '24px',
          borderRadius: '12px',
          fontSize: '16px'
        }}>
          <h2 style={{ fontSize: '22px' }}>📤 Upload File</h2>
          <div
            style={{
              backgroundColor: '#e6e6e6',
              borderRadius: '8px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ fontSize: '16px' }}
            />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ fontSize: '16px', padding: '8px', borderRadius: '6px' }}
            >
              <option value="">Select Month</option>
              {months.map((month) => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
            <button
              style={{ fontSize: '16px', padding: '10px' }}
              onClick={() => {
                if (validateFile(file)) {
                  uploadFile(file, "https://nkxcgcfsj6.execute-api.ap-south-1.amazonaws.com/P2/Production_Uploadlink");
                }
              }}
            >
              Submit File
            </button>
          </div>
          {responseMessage && (
            <p style={{ marginTop: '12px', color: 'green', fontSize: '16px' }}>{responseMessage}</p>
          )}
        </div>

        {/* Calendar Section */}
        <div style={{
          flex: 1,
          minWidth: '400px',
          backgroundColor: '#f0f0f0',
          padding: '24px',
          borderRadius: '12px',
          fontSize: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              onClick={handlePreviousYear}>&lt;</button>
            <h2 style={{ fontSize: '22px', margin: '0',textAlign: 'center' }}> {year}</h2>
            <button
              onClick={handleNextYear}>&gt;
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)', // 4 columns for 12 months
              gap: '10px',
              padding: '10px',
              backgroundColor: '#e6e6e6',
              borderRadius: '8px'
            }}
          >
            {months.map((month) => (
              <button
                key={month}
                onClick={() => setDisplayedMonth(month === displayedMonth ? "" : month)} // Toggle selection
                style={{
                  padding: '10px',
                  fontSize: '16px',
                  backgroundColor: displayedMonth === month ? '#007BFF' : '#fff',
                  color: displayedMonth === month ? '#fff' : '#000',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                {month}
              </button>
            ))}
          </div>
          {/* Display sample file link for selected month */}
          {displayedMonth && (
            <div style={{ marginTop: '20px' }}>
              <a
                href={`https://your-bucket-name.s3.amazonaws.com/sample-files/${displayedMonth}.xlsx`}
                download
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  textDecoration: 'none',
                  color: '#007BFF',
                  backgroundColor: '#e6f2ff',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  display: 'inline-block',
                  fontSize: '16px'
                }}
              >
                {displayedMonth} Sample Excel
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default App;
