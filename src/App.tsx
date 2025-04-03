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
          Sign
