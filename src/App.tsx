import React, { useState, useEffect } from 'react';
import './App.css';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getCurrentUser, fetchUserAttributes, updateUserAttributes } from '@aws-amplify/auth';

// Debug logging to confirm imports
console.log('getCurrentUser:', getCurrentUser);
console.log('fetchUserAttributes:', fetchUserAttributes);
console.log('updateUserAttributes:', updateUserAttributes);

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

// Function to get financial year months (previous month if <= 6th, current month, remaining months)
const getFinancialYearMonths = (currentDate: Date) => {
  const currentMonth = currentDate.getMonth(); // 0-based (May 2025 = 4)
  const currentYear = currentDate.getFullYear(); // 2025
  const currentDay = currentDate.getDate(); // 28

  // Financial year: April (currentYear) to March (currentYear + 1)
  const financialYearStartYear = currentMonth >= 3 ? currentYear : currentYear - 1; // April 2025
  const financialYearEndYear = financialYearStartYear + 1; // March 2026

  const result: string[] = [];

  // Previous month (only if day <= 6)
  if (currentDay <= 6) {
    const prevMonthDate = new Date(currentDate);
    prevMonthDate.setMonth(currentMonth - 1);
    const prevMonth = prevMonthDate.getMonth();
    const prevMonthYear = prevMonthDate.getFullYear();
    result.push(`${months[prevMonth]} ${prevMonthYear}`);
  }

  // Current month
  result.push(`${months[currentMonth]} ${currentYear}`);

  // Remaining months: from currentMonth + 1 to March
  for (let month = currentMonth + 1; month <= 11; month++) {
    result.push(`${months[month]} ${financialYearStartYear}`);
  }
  for (let month = 0; month <= 2; month++) {
    result.push(`${months[month]} ${financialYearEndYear}`);
  }

  return result;
};

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
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch user attributes on mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setIsLoading(true);
        await getCurrentUser();
        const attributes = await fetchUserAttributes();
        console.log('User attributes:', attributes);
        const username = attributes.preferred_username || attributes.email || '';
        const phoneNumber = attributes.phone_number || '';
        const maskedPhoneNumber =
          phoneNumber && phoneNumber.length >= 2
            ? `91${'x'.repeat(phoneNumber.length - 4)}${phoneNumber.slice(-2)}`
            : '';
        setUserAttributes({ username, phoneNumber: maskedPhoneNumber });
      } catch (error) {
        console.error('Error fetching user data:', error);
        setUserAttributes({ username: '', phoneNumber: '' });
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserData();
  }, []);

  // Handle username update
  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) {
      alert('Please enter a valid username.');
      return;
    }
    try {
      await updateUserAttributes({
        userAttributes: {
          preferred_username: newUsername.trim(),
        },
      });
      setUserAttributes((prev) => ({ ...prev, username: newUsername.trim() }));
      setShowUpdateForm(false);
      setNewUsername('');
      alert('Username updated successfully!');
      const attributes = await fetchUserAttributes();
      setUserAttributes((prev) => ({
        ...prev,
        username: attributes.preferred_username || prev.username,
      }));
    } catch (error: any) {
      console.error('Error updating username:', error);
      alert(`Failed to update username: ${error.message || 'Unknown error'}`);
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

    // Extract month name from "Month Year" (e.g., "May 2025" -> "May")
    const monthName = selectedMonth.split(' ')[0];

    const formData = new FormData();
    formData.append('file', file);
    formData.append('month', monthName);

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

  // Get financial year months for dropdown
  const financialYearMonths = getFinancialYearMonths(new Date());

  return (
    <main className="app-main">
      <header className="app-header">
        <div style={{ width: '130px', height: '120px', overflow: 'hidden', borderRadius: '8px', marginLeft: '20px' }}>
          <img
            style={{ width: '100%', height: '100%', objectFit: 'contain', boxSizing: 'border-box' }}
            src="https://www.bharatbiotech.com/images/bharat-biotech-logo.jpg"
            alt="Company Logo"
          />
        </div>
        <div className="header-user-info">
          {isLoading ? (
            <span>Loading...</span>
          ) : (
            <div className="user-info-inner">
              <span className="username">
                {userAttributes.username ? (
                  `Hi, ${userAttributes.username}`
                ) : (
                  <button
                    className="update-username-btn"
                    onClick={() => setShowUpdateForm(true)}
                  >
                    Update Username
                  </button>
                )}
              </span>
              <span className="phone-number">{userAttributes.phoneNumber || 'Phone: Not set'}</span>
            </div>
          )}
          <button className="sign-out-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {/* Pop-up Form for Updating Username */}
      {showUpdateForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ fontSize: '22px', margin: '0 0 16px 0' }}>Update Username</h2>
            <form onSubmit={handleUpdateUsername}>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Enter new username"
                className="username-input"
              />
              <div className="modal-buttons">
                <button type="submit" className="submit-btn">Submit</button>
                <button type="button" className="cancel-btn" onClick={() => setShowUpdateForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <h1 style={{ padding: '10px', textAlign: 'center', width: '100%', fontSize: '28px', margin: '0', boxSizing: 'border-box' }}>
        <u>BBIL Production-Upload Interface</u>
      </h1>

      <div
        className="container"
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '20px',
          maxWidth: '100%',
          padding: '20px',
          boxSizing: 'border-box',
          overflowX: 'hidden',
        }}
      >
        {/* Left Column: Calendar and Upload File */}
        <div
          style={{
            flex: 1.25,
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            minWidth: '250px',
          }}
        >
          {/* Calendar Section */}
          <div
            style={{
              backgroundColor: '#f0f0f0',
              padding: '24px',
              borderRadius: '12px',
              fontSize: '16px',
              boxSizing: 'border-box',
            }}
          >
            <h2 style={{ fontSize: '22px', margin: '0 0 16px 0', textAlign: 'center' }}>Sample File Download Segment</h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button onClick={handlePreviousYear}>{'\u003C'}</button>
              <h2 style={{ fontSize: '22px', margin: '0', textAlign: 'center' }}>{year}</h2>
              <button onClick={handleNextYear}>{'\u003E'}</button>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '10px',
                padding: '10px',
                backgroundColor: '#e6e6e6',
                borderRadius: '8px',
              }}
            >
              {months.map((month) => (
                <button
                  key={month}
                  onClick={() => setDisplayedMonth(month === displayedMonth ? "" : month)}
                  style={{
                    padding: '10px',
                    fontSize: '16px',
                    backgroundColor: displayedMonth === month ? '#007BFF' : '#fff',
                    color: displayedMonth === month ? '#fff' : '#000',
                    border: '1px solid #ccc',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  {month}
                </button>
              ))}
            </div>
            {displayedMonth && (
              <div style={{ marginTop: '20px' }}>
                <button
                  onClick={() => downloadFile(displayedMonth)}
                  style={{
                    textDecoration: 'none',
                    color: '#fff',
                    backgroundColor: '#007BFF',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '16px',
                  }}
                >
                  Download {displayedMonth} Sample CSV
                </button>
              </div>
            )}
          </div>

          {/* Upload Section */}
          <div
            style={{
              backgroundColor: '#f0f0f0',
              padding: '24px',
              borderRadius: '12px',
              fontSize: '16px',
              boxSizing: 'border-box',
            }}
          >
            <h2 style={{ fontSize: '22px', margin: '0' }}>📤 Upload File</h2>
            <div
              style={{
                backgroundColor: '#e6e6e6',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
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
                {financialYearMonths.map((monthYear) => (
                  <option key={monthYear} value={monthYear}>{monthYear}</option>
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
        </div>

        {/* Right Column: File List Table */}
        <div
          style={{
            flex: 1.6,
            minWidth: '200px',
            backgroundColor: '#f0f0f0',
            padding: '24px',
            borderRadius: '12px',
            fontSize: '16px',
            alignSelf: 'stretch',
            boxSizing: 'border-box',
          }}
        >
          <h2 style={{ fontSize: '22px', margin: '0' }}>📋 List of Files Uploaded</h2>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                backgroundColor: '#e6e6e6',
                borderRadius: '8px',
                fontSize: '16px',
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      padding: '12px',
                      borderBottom: '2px solid #ccc',
                      textAlign: 'center',
                      backgroundColor: '#d9d9d9',
                    }}
                  >
                    S.No.
                  </th>
                  <th
                    style={{
                      padding: '12px',
                      borderBottom: '2px solid #ccc',
                      textAlign: 'center',
                      backgroundColor: '#d9d9d9',
                    }}
                  >
                    File Name
                  </th>
                  <th
                    style={{
                      padding: '12px',
                      borderBottom: '2px solid #ccc',
                      textAlign: 'center',
                      backgroundColor: '#d9d9d9',
                    }}
                  >
                    Filesize
                  </th>
                  <th
                    style={{
                      padding: '12px',
                      borderBottom: '2px solid #ccc',
                      textAlign: 'center',
                      backgroundColor: '#d9d9d9',
                    }}
                  >
                    Date Uploaded
                  </th>
                  <th
                    style={{
                      padding: '12px',
                      borderBottom: '2px solid #ccc',
                      textAlign: 'center',
                      backgroundColor: '#d9d9d9',
                    }}
                  >
                    Uploaded By
                  </th>
                  <th
                    style={{
                      padding: '12px',
                      borderBottom: '2px solid #ccc',
                      textAlign: 'center',
                      backgroundColor: '#d9d9d9',
                    }}
                  >
                    Download Link
                  </th>
                </tr>
              </thead>
              <tbody>
                {sampleFiles.map((file) => (
                  <tr key={file.id}>
                    <td style={{ padding: '12px', borderBottom: '1px solid #ccc', textAlign: 'center' }}>{file.id}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #ccc', textAlign: 'left' }}>{file.fileName}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #ccc', textAlign: 'center' }}>{file.filesize}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #ccc', textAlign: 'center' }}>{file.dateUploaded}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #ccc', textAlign: 'center' }}>{file.uploadedBy}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #ccc', textAlign: 'center' }}>
                      <a
                        href={file.downloadLink}
                        onClick={(e) => {
                          e.preventDefault();
                          downloadFile(file.fileName.split('_')[0]);
                        }}
                        style={{
                          textDecoration: 'none',
                          color: '#007BFF',
                          cursor: 'pointer',
                        }}
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
};

export default App;
