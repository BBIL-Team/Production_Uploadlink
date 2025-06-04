import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getCurrentUser, fetchUserAttributes, updateUserAttributes } from '@aws-amplify/auth';

// Debug logging to console
console.log('getCurrentUser:', getCurrentUser);
console.log('fetchUserAttributes:', fetchUserAttributes);
console.log('updateUserAttributes:', updateUserAttributes);

// Hardcoded bucket and folder names
const BUCKET_NAME = 'production-bbil';
const FOLDER_NAME = 'Production_daily_upload_files_location/';

// Supported file extensions
const SUPPORTED_EXTENSIONS = ['.csv', '.pdf', '.xlsx', '.xls', '.doc', '.docx'];

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Function to get financial year months (previous month if <= 6th, current month, remaining months)
const getFinancialYearMonths = (currentDate: Date) => {
  const currentMonth = currentDate.getMonth(); // 0-based (June 2025 = 5)
  const currentYear = currentDate.getFullYear();
  const currentDay = currentDate.getDate();

  // Financial year: April (currentYear) to March (currentYear + 1)
  const financialYearStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const financialYearEndYear = financialYearStartYear + 1;

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
  const [userAttributes, setUserAttributes] = useState<{ username?: string; phoneNumber?: string }>({
    username: '',
    phoneNumber: '',
  });
  const [showUpdateForm, setShowUpdateForm] = useState<boolean>(false);
  const [newUsername, setNewUsername] = useState<string>("");
  const [isLoading, setLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [showMessageModal, setShowMessageModal] = useState<boolean>(false);
  const [modalMessage, setModalMessage] = useState<string>("");
  const [modalType, setModalType] = useState<'success' | 'error'>('success');
  const [s3Files, setS3Files] = useState<
    { id: number; fileName: string; fileType: string; filesize: string; dateUploaded: string; uploadedBy: string; fileKey: string }[]
  >([]);
  const [sortColumn, setSortColumn] = useState<keyof typeof s3Files[0] | ''>(''); // Track sorted column
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc'); // Track sort direction
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch user attributes and S3 files on mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
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
        setLoading(false);
      }
    };

    const fetchS3Files = async () => {
      try {
        // Construct the query string with bucket_name and folder_name
        const queryParams = new URLSearchParams({
          bucket_name: BUCKET_NAME,
          folder_name: FOLDER_NAME,
        });
        const response = await fetch(`https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/list-files?${queryParams.toString()}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch S3 files: ${response.status}`);
        }
        const data = await response.json();
        console.log('S3 files:', data);

        const files = await Promise.all(
          data.files
            .filter((file: { key: string }) => {
              const extension = (file.key.split('.').pop() || '').toLowerCase();
              return SUPPORTED_EXTENSIONS.includes(`.${extension}`);
            }) // Filter supported file formats
            .map(async (file: { key: string; size: number; lastModified: string }, index: number) => {
              // Extract full file name (including extension)
              const fullFileName = file.key.split('/').pop() || ''; // e.g., "SomeReport.pdf"
              const fileNameParts = fullFileName.split('.');
              const fileName = fileNameParts.slice(0, -1).join('.'); // Name without extension, e.g., "SomeReport"
              const fileType = fileNameParts[fileNameParts.length - 1]?.toLowerCase() || ''; // e.g., "pdf"

              // Format filesize (bytes to KB)
              const filesizeKB = (file.size / 1024).toFixed(1) + ' KB';

              // Format date
              const dateUploaded = new Date(file.lastModified).toISOString().split('T')[0];

              // Fetch uploadedBy from DynamoDB
              let uploadedBy = 'Unknown';
              try {
                const uploaderResponse = await fetch(
                  `https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/get-uploader?fileName=${encodeURIComponent(fullFileName)}`,
                  {
                    method: 'GET',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                  }
                );
                if (uploaderResponse.ok) {
                  const uploaderData = await uploaderResponse.json();
                  uploadedBy = uploaderData.uploadedBy || 'Unknown';
                }
              } catch (error) {
                console.error(`Error fetching uploader for ${fullFileName}:`, error);
              }

              return {
                id: index + 1,
                fileName, // Name without extension
                fileType,
                filesize: filesizeKB,
                dateUploaded,
                uploadedBy,
                fileKey: file.key, // Full key, e.g., "Production_daily_upload_files_location/SomeReport.pdf"
              };
            })
        );

        // Sort by dateUploaded descending by default
        files.sort((a, b) => new Date(b.dateUploaded).getTime() - new Date(a.dateUploaded).getTime());
        setS3Files(files);
        setSortColumn('dateUploaded'); // Default sort column
        setSortDirection('desc'); // Default sort direction
      } catch (error) {
        console.error('Error fetching S3 files:', error);
        setModalMessage('Failed to load files from server.');
        setModalType('error');
        setShowMessageModal(true);
      }
    };

    fetchUserData();
    fetchS3Files();
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
    if (file) {
      const extension = (file.name.split('.').pop() || '').toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(`.${extension}`)) {
        return true;
      }
    }
    setModalMessage("Please upload a valid file (.csv, .pdf, .xlsx, .xls, .doc, .docx).");
    setModalType('error');
    setShowMessageModal(true);
    return false;
  };

  const uploadFile = async (file: File | null, apiUrl: string) => {
    if (!file) {
      setModalMessage("Please select a file to upload.");
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

    // Extract month name from "Month Year" (e.g., "June 2025" -> "June")
    const monthName = selectedMonth.split(' ')[0];
    const originalFileName = file.name; // Preserve original file name, e.g., "MyReport.xlsx"

    const formData = new FormData();
    formData.append('file', file);
    formData.append('month', monthName);
    formData.append('fileName', originalFileName); // Pass original file name to Lambda

    try {
      // Upload to S3
      const uploadResponse = await fetch(apiUrl, {
        method: "POST",
        body: formData,
      });

      if (uploadResponse.ok) {
        const uploadData = await uploadResponse.json();
        setModalMessage(uploadData.message || "File uploaded successfully!");
        setModalType('success');
        setShowMessageModal(true);

        // Save to DynamoDB
        try {
          await fetch('https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/save-upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileName: originalFileName,
              uploadedBy: userAttributes.username || 'Unknown',
            }),
          });
        } catch (error) {
          console.error('Error saving to DynamoDB:', error);
          setModalMessage('File uploaded, but failed to save upload details.');
          setModalType('error');
          setShowMessageModal(true);
        }

        // Refresh file list
        try {
          const queryParams = new URLSearchParams({
            bucket_name: BUCKET_NAME,
            folder_name: FOLDER_NAME,
          });
          const response = await fetch(`https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/list-files?${queryParams.toString()}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch S3 files: ${response.status}`);
          }
          const data = await response.json();
          console.log('S3 files:', data);

          const files = await Promise.all(
            data.files
              .filter((file: { key: string }) => {
                const extension = (file.key.split('.').pop() || '').toLowerCase();
                return SUPPORTED_EXTENSIONS.includes(`.${extension}`);
              })
              .map(async (file: { key: string; size: number; lastModified: string }, index: number) => {
                const fullFileName = file.key.split('/').pop() || '';
                const fileNameParts = fullFileName.split('.');
                const fileName = fileNameParts.slice(0, -1).join('.'); // Name without extension
                const fileType = fileNameParts[fileNameParts.length - 1]?.toLowerCase() || '';
                const filesizeKB = (file.size / 1024).toFixed(1) + ' KB';
                const dateUploaded = new Date(file.lastModified).toISOString().split('T')[0];

                let uploadedBy = 'Unknown';
                try {
                  const uploaderResponse = await fetch(
                    `https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/get-uploader?fileName=${encodeURIComponent(fullFileName)}`,
                    {
                      method: 'GET',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                    }
                  );
                  if (uploaderResponse.ok) {
                    const uploaderData = await uploaderResponse.json();
                    uploadedBy = uploaderData.uploadedBy || 'Unknown';
                  }
                } catch (error) {
                  console.error(`Error fetching uploader for ${fullFileName}:`, error);
                }

                return {
                  id: index + 1,
                  fileName,
                  fileType,
                  filesize: filesizeKB,
                  dateUploaded,
                  uploadedBy,
                  fileKey: file.key,
                };
              })
          );
          files.sort((a, b) => new Date(b.dateUploaded).getTime() - new Date(a.dateUploaded).getTime());
          setS3Files(files);
          setSortColumn('dateUploaded');
          setSortDirection('desc');
        } catch (error) {
          console.error('Error refreshing S3 files:', error);
        }
      } else {
        const errorText = await uploadResponse.text();
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

  const downloadFile = async (key: string, isMonth: boolean = false) => {
    try {
      // Determine the full file key based on the source
      let fileKey: string;
      if (isMonth) {
        // Sample files are in Production_Sample_Files/
        fileKey = `Production_Sample_Files/${key}_Sample_File.csv`;
      } else {
        // Uploaded files are in Production_daily_upload_files_location/, use the full key as-is
        fileKey = key; // e.g., "Production_daily_upload_files_location/SomeReport.pdf"
      }

      const response = await fetch('https://e3blv3dko6.execute-api.ap-south-1.amazonaws.com/P1/presigned_urls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bucket_name: BUCKET_NAME,
          file_key: fileKey,
          action: 'download',
        }),
      });
      console.log('Response status:', response.status, 'OK:', response.ok);
      const data = await response.json();
      console.log('Response data:', data);
      if (response.ok && data.presigned_url) {
        const link = document.createElement('a');
        link.href = data.presigned_url;
        link.download = fileKey.split('/').pop() || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setModalMessage(`Downloaded ${fileKey.split('/').pop()} successfully!`);
        setModalType('success');
        setShowMessageModal(true);
      } else {
        setModalMessage(`Error: ${data.error || 'Failed to fetch download link'} (Status: ${response.status})`);
        setModalType('error');
        setShowMessageModal(true);
      }
    } catch (error: any) {
      console.error('Download error:', error);
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
    setModalMessage('');
    setModalType('success');
  };

  // Handle sorting
  const handleSort = (column: keyof typeof s3Files[0]) => {
    const newDirection = sortColumn === column && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortColumn(column);
    setSortDirection(newDirection);

    const sortedFiles = [...s3Files].sort((a, b) => {
      const valueA = a[column];
      const valueB = b[column];

      // Handle numeric sorting for id
      if (column === 'id') {
        return newDirection === 'asc'
          ? (valueA as number) - (valueB as number)
          : (valueB as number) - (valueA as number);
      }

      // Handle numeric sorting for filesize
      if (column === 'filesize') {
        const sizeA = parseFloat((valueA as string).replace(' KB', ''));
        const sizeB = parseFloat((valueB as string).replace(' KB', ''));
        return newDirection === 'asc' ? sizeA - sizeB : sizeB - sizeA;
      }

      // Handle date sorting for dateUploaded
      if (column === 'dateUploaded') {
        return newDirection === 'asc'
          ? new Date(valueA as string).getTime() - new Date(valueB as string).getTime()
          : new Date(valueB as string).getTime() - new Date(a.dateUploaded).getTime();
      }

      // Default string sorting for other columns (fileName, fileType, uploadedBy, fileKey)
      return newDirection === 'asc'
        ? (valueA as string).localeCompare(valueB as string)
        : (valueB as string).localeCompare(valueA as string);
    });

    setS3Files(sortedFiles);
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
                  <button className="update-username-btn" onClick={() => setShowUpdateForm(true)}>
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
        <u>BBIL Production Dashboard Update Interface</u>
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
                <button onClick={() => downloadFile(displayedMonth, true)} className="download-btn">
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
                accept=".csv,.pdf,.xlsx,.xls,.doc,.docx"
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
                        className={`dropdown-item ${selectedMonth === monthYear ? 'selected' : ''}`}
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
                    uploadFile(file, 'https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/Production_Uploadlink');
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
                  <th onClick={() => handleSort('id')} className={sortColumn === 'id' ? `sorted-${sortDirection}` : ''}>
                    S.No.
                  </th>
                  <th onClick={() => handleSort('fileName')} className={sortColumn === 'fileName' ? `sorted-${sortDirection}` : ''}>
                    File Name
                  </th>
                  <th onClick={() => handleSort('fileType')} className={sortColumn === 'fileType' ? `sorted-${sortDirection}` : ''}>
                    File Type
                  </th>
                  <th onClick={() => handleSort('filesize')} className={sortColumn === 'filesize' ? `sorted-${sortDirection}` : ''}>
                    Filesize
                  </th>
                  <th onClick={() => handleSort('dateUploaded')} className={sortColumn === 'dateUploaded' ? `sorted-${sortDirection}` : ''}>
                    Date Uploaded
                  </th>
                  <th onClick={() => handleSort('uploadedBy')} className={sortColumn === 'uploadedBy' ? `sorted-${sortDirection}` : ''}>
                    Uploaded By
                  </th>
                  <th onClick={() => handleSort('fileKey')} className={sortColumn === 'fileKey' ? `sorted-${sortDirection}` : ''}>
                    Download Link
                  </th>
                </tr>
              </thead>
              <tbody>
                {s3Files.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center' }}>
                      No files found.
                    </td>
                  </tr>
                ) : (
                  s3Files.map((file) => (
                    <tr key={file.id}>
                      <td>{file.id}</td>
                      <td data-full-text={file.fileName}>{file.fileName}</td>
                      <td>{file.fileType}</td>
                      <td>{file.filesize}</td>
                      <td>{file.dateUploaded}</td>
                      <td>{file.uploadedBy}</td>
                      <td>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            downloadFile(file.fileKey);
                          }}
                          className="download-link"
                        >
                          Download
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
};

export default App;
