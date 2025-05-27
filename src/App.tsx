import React, { useState, useEffect } from 'react';
import './App.css';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { currentAuthenticatedUser, updateUserAttributes } from '@aws-amplify/auth'; // Updated imports

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Sample data for the table
const sampleFiles = [
  { id: 1, fileName: "January_Sample_File.csv", dateUploaded: "2025-01-15", uploadedBy: "John Doe", downloadLink: "#", filesize: "12.5 kb" },
  { id: 2, fileName: "February_Sample_File.csv", dateUploaded: "2025-02-10", uploadedBy: "Jane Smith", downloadLink: "#", filesize: "57.5 kb" },
  { id: 3, fileName: "March_Sample_File.csv", dateUploaded: "2025-03-20", uploadedBy: "Alice Johnson", downloadLink: "#", filesize: "62.8 kb" },
];

const App: React.FC = () => {
  const { signOut } = useAuthenticator();
  const [file, setFile] = useState<File | null>(null);
  const [responseMessage, setResponseMessage] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [displayedMonth, setDisplayedMonth] = useState<string>("");
  const [year, setYear] = useState<number>(2025);
  const [userAttributes, setUserAttributes] = useState<{ username: string; phoneNumber: string }>({
    username: '',
    phoneNumber: '',
  });
  const [showUpdateForm, setShowUpdateForm] = useState<boolean>(false);
  const [newUsername, setNewUsername] = useState<string>("");

  // Fetch user attributes on mount
  useEffect(() => {
    const fetchUserAttributes = async () => {
      try {
        const currentUser = await currentAuthenticatedUser();
        const attributes = currentUser.attributes || {};
        const username = attributes.preferred_username || attributes.email || currentUser.username || '';
        const phoneNumber = attributes.phone_number || '';
        // Mask phone number to show only last two digits
        const maskedPhoneNumber =
          phoneNumber && phoneNumber.length >= 2
            ? `91${'x'.repeat(phoneNumber.length - 4)}${phoneNumber.slice(-2)}`
            : '';
        setUserAttributes({ username, phoneNumber: maskedPhoneNumber });
      } catch (error) {
        console.error('Error fetching user attributes:', error);
        setUserAttributes({ username: '', phoneNumber: '' });
      }
    };
    fetchUserAttributes();
  }, []);

  // Handle username update
  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) {
      alert('Please enter a valid username.');
      return;
    }
    try {
      const currentUser = await currentAuthenticatedUser();
      await updateUserAttributes(currentUser, {
        preferred_username: newUsername.trim(),
      });
      setUserAttributes((prev) => ({ ...prev, username: newUsername.trim() }));
      setShowUpdateForm(false);
      setNewUsername('');
      alert('Username updated successfully!');
    } catch (error) {
      console.error('Error updating username:', error);
      alert('Failed to update username. Please try again.');
    }
  };

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

  const downloadFile = async (month: string) => {
    try {
      const response = await fetch("https://e3blv3dko6.execute-api.ap-south-1.amazonaws.com/P1/presigned_urls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file_key: `${month}_Sample_File.csv` }),
      });
      console.log("Response status:", response.status, "OK:", response.ok);
      const data = await response.json();
      console.log("Response data:", data);
      if (response.ok && data.presigned_url) {
        const link = document.createElement("a");
        link.href = data.presigned_url;
        link.download = `${month}_Sample_File.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setResponseMessage(`Downloaded ${month}_Sample_File.csv successfully!`);
      } else {
        setResponseMessage(`Error: ${data.error || "Failed to fetch download link"} (Status: ${response.status})`);
      }
    } catch (error: any) {
      console.error("Download error:", error);
      setResponseMessage(`An error occurred while fetching the download link: ${error.message}`);
    }
  };

  const handlePreviousYear = () => setYear((prevYear) => prevYear - 1);
  const handleNextYear = () => setYear((prevYear) => prevYear + 1);

  return (
    <main style={{ maxWidth: '100%', minHeight: '100vh', backgroundColor: '#81d7ea', paddingTop: '360px', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <header style={{ maxWidth: '100%', backgroundColor: '#008080', display: 'flex', alignItems: 'center', padding: '4px', position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 1000, boxSizing: 'border-box' }}>
        <div style={{ width: '130px', height: '120px', overflow: 'hidden', borderRadius: '8px', marginLeft: '20px' }}>
          <img
            style={{ width: '100%', height: '100%', objectFit: 'contain', boxSizing: 'border-box' }}
            src="https://www.bharatbiotech.com/images/bharat-biotech-logo.jpg"
            alt="Company Logo"
            className="logo"
          />
        </div>
        <div style={{ marginLeft: 'auto', marginRight Plattform: '16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', color: 'white', fontSize: '14px' }}>
          <div>
            {userAttributes.username ? (
              `Hi, ${userAttributes.username}`
            ) : (
              <button
                style={{ color: 'white', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setShowUpdateForm(true)}
              >
                Update Username
              </button>
            )}
          </div>
          <div>{userAttributes.phoneNumber || 'Phone: Not set'}</div>
          <button style={{ marginTop: '8px', padding: '8px 12px', fontSize: '14px', color: 'white', backgroundColor: 'transparent', border: '1px solid white', borderRadius: '4px', cursor: 'pointer' }} onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {/* Pop-up Form for Updating Username */}
      {showUpdateForm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2000,
          }}
        >
          <div
            style={{
              backgroundColor: '#f0f0f0',
              padding: '24px',
              borderRadius: '12px',
              width: '300px',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontSize: '22
