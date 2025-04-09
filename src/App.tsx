Production Frontend codes:
Working code:
Code showing upload interface and calendar year in heading and months below when you click on month that particular months sample excel file link is opened
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


import boto3
from datetime import datetime
import json
import base64

s3 = boto3.client('s3')
BUCKET_NAME = 'production-bbil'

# Function to remove the header and footer
def remove_header_and_footer(csv_data):
    lines = csv_data.split('\n')
    cleaned_data = '\n'.join(lines[4:-3])  # Skip first 4 and last 3 lines
    return cleaned_data

# CORS headers
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",  # Replace with your domain in prod
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "OPTIONS,POST"
}

# Lambda handler
def lambda_handler(event, context):
    try:
        if "body" not in event:
            return {
                "statusCode": 400,
                "body": json.dumps({"message": "No file attachment found in the request."}),
            }

        headers = event.get("headers", {})
        file_name = headers.get("x-filename")

        if not file_name:
            return {
                "statusCode": 400,
                "body": json.dumps({"message": "Missing file name in 'x-filename' header."}),
            }

        # Handle decoding properly
        if event.get("isBase64Encoded", False):
            file_data = base64.b64decode(event["body"])
        else:
            file_data = event["body"].encode("utf-8")

        try:
            csv_data = file_data.decode('utf-8')
        except UnicodeDecodeError:
            return {
                "statusCode": 400,
                "body": json.dumps({"message": "File is not a valid UTF-8 encoded text file."})
            }

        cleaned_csv_data = remove_header_and_footer(csv_data)
        cleaned_file_data = cleaned_csv_data.encode('utf-8')

        s3.put_object(Bucket=BUCKET_NAME, Key=f"uploads/{file_name}", Body=cleaned_file_data)

        return {
            "statusCode": 200,
            "body": json.dumps({"message": f"File uploaded as {file_name}"}),
        }

    except Exception as e:
        print("Error:", str(e))
        return {
            "statusCode": 500,
            "body": json.dumps({"message": "Upload failed", "error": str(e)}),
        }



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
    // Convert file to base64
    const base64 = await convertToBase64(file);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-filename": file.name,
      },
      body: JSON.stringify({
        body: base64,
        isBase64Encoded: true,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      setMessage(data.message || "File uploaded successfully!");
    } else {
      const errorText = await response.text();
      setMessage(`Failed to upload file: ${errorText}`);
    }
  } catch (error) {
    console.error("Error uploading file:", error);
    setMessage("An error occurred while uploading the file.");
  }
};

// Helper function to convert file to base64
const convertToBase64 = (file: File): Promise<string> => {
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
