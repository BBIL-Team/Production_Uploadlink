import React, { useState, useEffect, useRef } from 'react';
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
  const currentDay = currentDate.getDate(); // 29

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
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [showMessageModal, setShowMessageModal] = useState<boolean>(false);
  const [modalMessage, setModalMessage] = useState<string>("");
  const [modalType, setModalType] = useState<'success' | 'error'>('success');
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Manage body scroll when modal is open
  useEffect(() => {
    if (showMessageModal || showUpdateForm) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    };
  }, [showMessageModal, showUpdateForm]);

  // Handle username update
  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) {
      setModalMessage('Please enter a valid username.');
      setModalType('error');
      setShowMessageModal(true);
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
      setModalMessage('Username updated successfully!');
      setModalType('success');
      setShowMessageModal(true);
      const attributes = await fetchUserAttributes();
      setUserAttributes((prev) => ({
        ...prev,
        username: attributes.preferred_username || prev.username,
      }));
    } catch (error: any) {
      console.error('Error updating username:', error);
      setModalMessage(`Failed to update username: ${error.message || 'Unknown error'}`);
      setModalType('error');
      setShowMessageModal(true);
    }
  };

  const validateFile = (file: File | null): boolean => {
    if (file && file.name.endsWith(".csv")) {
      return true;
    }
    setModalMessage("Please upload a valid CSV file.");
    setModalType('error');
    setShowMessageModal(true);
    return false;
  };

  const uploadFile = async (file: File | null, apiUrl: string) => {
    if (!file) {
      setModalMessage("Please select a CSV file to upload.");
      setModalType('error');
      setShowMessageModal(true);
      return;
    }
    if (!selectedMonth) {
      setModalMessage("Please select the correct month.");
      setModalType('error');
      setShowMessageModal(true);
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
        setModalMessage(data.message || "File uploaded successfully!");
        setModalType('success');
        setShowMessageModal(true);
      } else {
        const errorText = await response.text();
        setModalMessage(`Failed to upload file: ${errorText}`);
        setModalType('error');
        setShowMessageModal(true);
      }
    } catch (error) {
      console.error("Error:", error);
      setModalMessage("An error occurred while uploading the file.");
      setModalType('error');
      setShowMessageModal(true);
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
        setModalMessage(`Downloaded ${month}_Sample_File.csv successfully!`);
        setModalType('success');
        setShowMessageModal(true);
      } else {
        setModalMessage(`Error: ${data.error || "Failed to fetch download link"} (Status: ${response.status})`);
        setModalType('error');
        setShowMessageModal(true);
      }
    } catch (error: any) {
      console.error("Download error:", error);
      setModalMessage(`An error occurred while fetching the download link: ${error.message}`);
      setModalType('error');
      setShowMessageModal(true);
    }
  };

  const handlePreviousYear = () => setYear((prevYear) => prevYear - 1);
  const handleNextYear = () => setYear((prevYear) => prevYear + 1);

  // Toggle dropdown
  const toggleDropdown = () => setIsDropdownOpen((prev) => !prev);

  // Select month
  const selectMonth = (monthYear: string) => {
    setSelectedMonth(monthYear);
    setIsDropdownOpen(false);
  };

  // Close message modal
  const closeMessageModal = () => {
    setShowMessageModal(false);
    setModalMessage("");
    setModalType('success');
  };

  // Get financial year months for dropdown
  const financialYearMonths = getFinancialYearMonths(new Date());

  return (
    <main className="app-main">
      {/* Header */}
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

      {/* Username Update Modal */}
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

      {/* Message Modal */}
      {showMessageModal && (
        <div className="modal-overlay">
          <div className="modal-content message-modal">
            <span className={`modal-icon ${modalType === 'success' ? 'success-icon' : 'error-icon'}`}>
              {modalType === 'success' ? '✅' : '❌'}
            </span>
            <h3 className="modal-title">{modalType === 'success' ? 'Success' : 'Error'}</h3>
            <p className={`message-text ${modalType === 'success' ? 'success-text' : 'error-text'}`}>
              {modalMessage}
            </p>
            <button className="ok-btn" onClick={closeMessageModal}>
              OK
            </button>
          </div>
        </div>
      )}

      {/* Title */}
      <h1 className="app-title">
        <u>BBIL Production-Upload Interface</u>
      </h1>

      {/* Main Container */}
      <div className="container">
        {/* Left Column: Calendar and Upload */}
        <div className="left-column">
          {/* Calendar Section */}
          <div className="calendar-section">
            <h2>Sample File Download Segment</h2>
            <div className="year-navigation">
              <button onClick={handlePreviousYear}>{'\u003C'}</button>
              <h2>{year}</h2>
              <button onClick={handleNextYear}>{'\u003E'}</button>
            </div>
            <div className="months-grid">
              {months.map((month) => (
                <button
                  key={month}
                  onClick={() => setDisplayedMonth(month === displayedMonth ? '' : month)}
                  className={`month-button ${displayedMonth === month ? 'active-month' : ''}`}
                >
                  {month}
                </button>
              ))}
            </div>
            {displayedMonth && (
              <div className="download-button">
                <button
                  onClick={() => downloadFile(displayedMonth)}
                  className="download-btn"
                >
                  Download {displayedMonth} Sample CSV
                </button>
              </div>
            )}
          </div>

          {/* Upload Section */}
          <div className="upload-section">
            <h2>📤 Upload File</h2>
            <div className="upload-form">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="file-input"
              />
              <div className="custom-dropdown" ref={dropdownRef}>
                <div
                  className={`dropdown-toggle ${isDropdownOpen ? 'open' : ''}`}
                  onClick={toggleDropdown}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleDropdown();
                    }
                  }}
                >
                  <span>{selectedMonth || 'Select Month'}</span>
                  <span className="dropdown-arrow"></span>
                </div>
                {isDropdownOpen && (
                  <ul className="dropdown-menu">
                    {financialYearMonths.map((monthYear) => (
                      <li
                        key={monthYear}
                        className={`dropdown-item ${selectedMonth === 'monthYear' ? 'selected' : ''}`}
                        onClick={() => selectMonth(monthYear)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectMonth(monthYear);
                          }
                        }}
                        tabIndex={0}
                        role="option"
                        aria-selected={selectedMonth === monthYear}
                      >
                        {monthYear}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                className="upload-btn"
                onClick={() => {
                  if (validateFile(file)) {
                    uploadFile(file, "https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/Production_Uploadlink");
                  }
                }}
              >
                Submit File
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: File List Table */}
        <div className="file-list">
          <h2>📋 List of Files Uploaded</h2>
          <div className="table-container">
            <table className="file-table">
              <thead>
                <tr>
                  <th>S.No.</th>
                  <th>File Name</th>
                  <th>Filesize</th>
                  <th>Date Uploaded</th>
                  <th>Uploaded By</th>
                  <th>Download Link</th>
                </tr>
              </thead>
              <tbody>
                {sampleFiles.map((file) => (
                  <tr key={file.id}>
                    <td>{file.id}</td>
                    <td>{file.fileName}</td>
                    <td>{file.filesize}</td>
                    <td>{file.dateUploaded}</td>
                    <td>{file.uploadedBy}</td>
                    <td>
                      <a
                        href={file.downloadLink}
                        onClick={(e) => {
                          e.preventDefault();
                          downloadFile(file.fileName.split('_')[0]);
                        }}
                        className="download-link"
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
