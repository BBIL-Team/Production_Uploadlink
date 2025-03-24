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
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const dataUpdateStatus: "Yes" | "No" = "No";

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
                  uploadFile(file, "https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/Production_Uploadlink");
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

        {/* Download Sample Files Section */}
        <div style={{
          flex: 2,
          minWidth: '400px',
          backgroundColor: '#f0f0f0',
          padding: '24px',
          borderRadius: '12px',
          fontSize: '16px'
        }}>
          <h2 style={{ fontSize: '22px' }}>📥 Download Sample Files (Monthly)</h2>
          <ul style={{ listStyleType: 'none', padding: 0 }}>
            {months.map((month) => (
              <li key={month} style={{ marginBottom: '10px' }}>
                <a
                  href={`https://your-bucket-name.s3.amazonaws.com/sample-files/${month}.xlsx`}
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
                  {month} Sample Excel
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Data Updation Status Section */}
        <div style={{
          flex: 1.2,
          minWidth: '250px',
          backgroundColor: '#f0f0f0',
          padding: '24px',
          borderRadius: '12px',
          fontSize: '16px',
          alignSelf: 'flex-start',
          height: 'fit-content'
        }}>
          <h2 style={{ fontSize: '22px' }}>📊 Data Updation Status</h2>
          <p style={{
            fontSize: '18px',
            color: dataUpdateStatus === "Yes" ? "green" : "red",
            fontWeight: 'bold',
            padding: '10px',
            backgroundColor: '#fff',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            {dataUpdateStatus}
          </p>
        </div>
      </div>
    </main>
  );
};

export default App;
