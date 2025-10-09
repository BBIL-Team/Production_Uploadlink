import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getCurrentUser, fetchUserAttributes, updateUserAttributes } from '@aws-amplify/auth';

// --- Footer link helpers (replace with your real values) ---
const DASHBOARD_URL = 'https://your-dashboard-url.example.com'; // TODO: replace
const SUPPORT_EMAIL = 'analytics@bharatbiotech.com';            // TODO: confirm or replace
const BA_PHONE_TEL  = '+914000000000';                          // TODO: replace with real phone in E.164

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

// Define the type for tooltip state
interface TooltipState {
  visible: boolean;
  content: string;
  x: number;
  y: number;
}

type FileRow = {
  id: number;
  fileName: string;
  fileType: string;
  filesize: string;       // "123.4 KB"
  dateUploaded: string;   // formatted date string
  uploadedBy: string;
  fileKey: string;
};


// Define the type for context menu state
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  column: keyof FileRow | null;
}


const App: React.FC = () => {
  const { signOut } = useAuthenticator();

  // ✅ Moved INSIDE the component; ref typed for <header>

  const [file, setFile] = useState<File | null>(null);
  const [dailyFileA, setDailyFileA] = useState<File | null>(null);
  const [dailyFileB, setDailyFileB] = useState<File | null>(null);
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
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadKey, setUploadKey] = useState<number>(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [showMessageModal, setShowMessageModal] = useState<boolean>(false);
  const [modalMessage, setModalMessage] = useState<string>("");
  const [modalType, setModalType] = useState<'success' | 'error'>('success');
  
  const [s3Files, setS3Files] = useState<FileRow[]>([]);
  const [sortColumn, setSortColumn] = useState<keyof FileRow | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [hiddenColumns, setHiddenColumns] = useState<Array<keyof FileRow>>([]);

  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState<boolean>(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [fileNameToDelete, setFileNameToDelete] = useState<string | null>(null);
  const [isDeleteOptionEnabled, setIsDeleteOptionEnabled] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'monthly' | 'daily'>('monthly'); // Default to monthly
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const reportSubject = 'Report a Problem – BBIL Production Dashboard';
  const reportBodyRaw = `Hi Business Analytics Team,

I'm facing an issue on the Production Dashboard.

Details:
- Username: ${userAttributes.username || 'Unknown'}
- Phone (masked): ${userAttributes.phoneNumber || 'Not set'}
- When: ${new Date().toLocaleString('en-IN')}
- What I was doing:
- Error message (if any):
- Steps to reproduce:

Thanks.`;

  const callbackSubject = 'Request for a Call Back – BBIL Production Dashboard';
  const callbackBodyRaw = `Hi Business Analytics Team,

Please call me back regarding the Production Dashboard.

- Name/Username: ${userAttributes.username || 'Unknown'}
- Phone (masked): ${userAttributes.phoneNumber || 'Not set'}
- Preferred time:

Thanks.`;

  const reportMailto   = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(reportSubject)}&body=${encodeURIComponent(reportBodyRaw)}`;
  const callbackMailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(callbackSubject)}&body=${encodeURIComponent(callbackBodyRaw)}`;

  // Tooltip state
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    content: '',
    x: 0,
    y: 0,
  });

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    column: null,
  });

  // Handle mouse enter to show tooltip
  const handleMouseEnter = (e: React.MouseEvent<HTMLTableCellElement>, content: string) => {
    setTooltip({
      visible: true,
      content,
      x: e.clientX,
      y: e.clientY,
    });
  };

  // Handle mouse move to update tooltip position
  const handleMouseMove = (e: React.MouseEvent<HTMLTableCellElement>) => {
    setTooltip((prev) => ({
      ...prev,
      x: e.clientX,
      y: e.clientY,
    }));
  };

  // Handle mouse leave to hide tooltip
  const handleMouseLeave = () => {
    setTooltip({
      visible: false,
      content: '',
      x: 0,
      y: 0,
    });
  };

  // Handle right-click to show context menu
  const handleContextMenu = (e: React.MouseEvent<HTMLTableCellElement>, column: keyof FileRow) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      column,
    });
  };

  // Handle hiding a column
  const handleHideColumn = () => {
    if (contextMenu.column) {
      setHiddenColumns((prev) => {
        const col = contextMenu.column;        // keyof FileRow | null
        if (col === null) return prev;         // narrow: stop if null
        if (prev.includes(col)) return prev;   // optional: avoid duplicates
        return [...prev, col];                 // col is keyof FileRow here
      });
      setContextMenu({ visible: false, x: 0, y: 0, column: null });
    }
  };


  useEffect(() => {
    const saved = localStorage.getItem('activeTab');
    if (saved === 'daily' || saved === 'monthly') setActiveTab(saved as 'daily' | 'monthly');
  }, []);
  
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  // Close context menu and dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0, column: null });
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadS3Files = async () => {
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
            const fileName = fileNameParts.slice(0, -1).join('.');
            const fileType = fileNameParts[fileNameParts.length - 1]?.toLowerCase() || '';
            const filesizeKB = (file.size / 1024).toFixed(1) + ' KB';
            const dateUploaded = new Date(file.lastModified).toLocaleString('en-IN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            });

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
      console.error('Error fetching S3 files:', error);
      setModalMessage('Failed to load files from server.');
      setModalType('error');
      setShowMessageModal(true);
    }
  };

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

    fetchUserData();
    loadS3Files();
  }, []);

  // Manage body scroll when modal is open
  useEffect(() => {
    if (showMessageModal || showUpdateForm || isUploading || showConfirmDeleteModal) {
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
  }, [showMessageModal, showUpdateForm, isUploading, showConfirmDeleteModal]);

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

  const uploadFile = async (file: File | null, apiUrl: string, month: string, segment?: 'DS' | 'DP') => {
    if (!file) {
      setModalMessage("Please select a file to upload.");
      setModalType('error');
      setShowMessageModal(true);
      return;
    }

    const originalFileName = file.name;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('month', month);
    if (segment) formData.append('segment', segment);
    formData.append('fileName', originalFileName);
    formData.append('username', userAttributes.username || 'Unknown');

    try {
      setIsUploading(true);
      setUploadKey((prev) => prev + 1);
      const uploadResponse = await fetch(apiUrl, {
        method: "POST",
        body: formData,
      });

      if (uploadResponse.ok) {
        const uploadData = await uploadResponse.json();
        setModalMessage(uploadData.message || "File uploaded successfully!");
        setModalType('success');
        setShowMessageModal(true);

        // Only save upload details for monthly uploads (skip for 'Daily')
        if (month !== 'Daily') {
          try {
            await fetch('https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/save-upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileName: originalFileName,
                uploadedBy: userAttributes.username || 'Unknown',
              }),
            });
          } catch (error) {
            console.error('Error saving to DynamoDB:', error);
            setModalMessage(`${uploadData.message || "File uploaded successfully!"} However, failed to save upload details.`);
            setModalType('error');
            setShowMessageModal(true);
          }
        }

        await loadS3Files();
      } else {
        const errorData = await uploadResponse.json();
        setModalMessage(errorData.message || errorData.error || `Failed to upload file: ${uploadResponse.statusText}`);
        setModalType('error');
        setShowMessageModal(true);
      }
    } catch (error: any) {
      console.error("Error:", error);
      setModalMessage(`An error occurred while uploading the file: ${error.message || 'Unknown error'}`);
      setModalType('error');
      setShowMessageModal(true);
    } finally {
      setIsUploading(false);
    }
  };
        
  const handleMonthlyUpload = () => {
    if (!selectedMonth) {
      setModalMessage("Please select the correct month.");
      setModalType('error');
      setShowMessageModal(true);
      return;
    }
    if (validateFile(file)) {
      const monthName = selectedMonth.split(' ')[0];
      uploadFile(file, 'https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/Production_Uploadlink', monthName);
    }
  };

  const handleDailyUpload = (file: File | null, segment: 'DS' | 'DP') => {
    if (validateFile(file)) {
      uploadFile(file, 'https://1whw41i19a.execute-api.ap-south-1.amazonaws.com/S1/Production_DailyUpload', 'Daily', segment);
    }
  };

  const downloadFile = async (key: string, isMonth: boolean = false) => {
    try {
      let fileKey: string;
      if (isMonth) {
        fileKey = `Production_Sample_Files/${key}_Sample_File.csv`;
      } else {
        fileKey = key;
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
          isSample: isMonth
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

        try {
          await fetch('https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1/save-files', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileName: fileKey.split('/').pop(),
              action: 'download',
              user: userAttributes.username || 'Unknown',
            }),
          });
        } catch (error) {
          console.error('Error saving download action:', error);
        }

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

  const deleteFile = async (key: string) => {
    try {
      const response = await fetch('https://e3blv3dko6.execute-api.ap-south-1.amazonaws.com/P1/presigned_urls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bucket_name: BUCKET_NAME,
          file_key: key,
          action: 'delete',
        }),
      });

      if (response.ok) {
        setModalMessage(`File ${key.split('/').pop()} deleted successfully!`);
        setModalType('success');
        setShowMessageModal(true);

        await loadS3Files();
      } else {
        const errorData = await response.json();
        setModalMessage(`Failed to delete file: ${errorData.message || response.statusText}`);
        setModalType('error');
        setShowMessageModal(true);
      }
    } catch (error: any) {
      console.error('Delete error:', error);
      setModalMessage(`An error occurred while deleting the file: ${error.message || 'Unknown error'}`);
      setModalType('error');
      setShowMessageModal(true);
    }
  };

  const handleConfirmDelete = () => {
    if (fileToDelete) {
      deleteFile(fileToDelete);
      setShowConfirmDeleteModal(false);
      setFileToDelete(null);
      setFileNameToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setShowConfirmDeleteModal(false);
    setFileToDelete(null);
    setFileNameToDelete(null);
  };

  const handlePreviousYear = () => setYear((prevYear) => prevYear - 1);
  const handleNextYear = () => setYear((prevYear) => prevYear + 1);

  const toggleDropdown = () => setIsDropdownOpen((prev) => !prev);

  const selectMonth = (monthYear: string) => {
    setSelectedMonth(monthYear);
    setIsDropdownOpen(false);
  };

  const closeMessageModal = () => {
    setShowMessageModal(false);
    setModalMessage('');
    setModalType('success');
  };

  const handleSort = (column: keyof FileRow) => {
    const newDirection = sortColumn === column && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortColumn(column);
    setSortDirection(newDirection);

    const sortedFiles = [...s3Files].sort((a, b) => {
      const valueA = a[column];
      const valueB = b[column];

      if (column === 'id') {
        return newDirection === 'asc'
          ? (valueA as number) - (valueB as number)
          : (valueB as number) - (valueA as number);
      }

      if (column === 'filesize') {
        const sizeA = parseFloat((valueA as string).replace(' KB', ''));
        const sizeB = parseFloat((valueB as string).replace(' KB', ''));
        return newDirection === 'asc' ? sizeA - sizeB : sizeB - sizeA;
      }

      if (column === 'dateUploaded') {
        return newDirection === 'asc'
          ? new Date(valueA as string).getTime() - new Date(valueB as string).getTime()
          // ✅ fixed to compare valueB vs valueA (was using a.dateUploaded)
          : new Date(valueB as string).getTime() - new Date(valueA as string).getTime();
      }

      return newDirection === 'asc'
        ? (valueA as string).localeCompare(valueB as string)
        : (valueB as string).localeCompare(valueA as string);
    });

    setS3Files(sortedFiles);
  };


  // Define table columns with their display names
  const columns: Array<{ key: keyof FileRow; label: string }> = [
    { key: 'id', label: 'S.No.' },
    { key: 'fileName', label: 'File Name' },
    { key: 'fileType', label: 'File Type' },
    { key: 'filesize', label: 'Filesize' },
    { key: 'dateUploaded', label: 'Date Uploaded' },
    { key: 'uploadedBy', label: 'Uploaded By' },
    { key: 'fileKey', label: 'Download Link' },
  ];

  return (
      <>
        {/* Fixed header lives outside of main */}
        <header className={`app-header ${activeTab === 'daily' ? 'daily-theme' : ''}`}>
          <div style={{ width: '130px', height: '100%', overflow: 'hidden', borderRadius: '8px', marginLeft: '20px' }}>
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
            <button className="sign-out-btn" onClick={signOut}>Sign out</button>
          </div>
        </header>
    
        {/* Spacer to push page content below the fixed header */}
        <div className="header-spacer" aria-hidden />

    <main className={`app-main ${activeTab === 'daily' ? 'daily-theme' : ''}`}>
      {tooltip.visible && (
        <div
          className="tooltip"
          style={{
            left: `${tooltip.x + 10}px`,
            top: `${tooltip.y + 10}px`,
          }}
        >
          {tooltip.content}
        </div>
      )}
      
      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          <div
            className="context-menu-item"
            onClick={handleHideColumn}
          >
            Hide Column
          </div>
        </div>
      )}

      
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
      {showConfirmDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Confirm Deletion</h3>
            <p className="message-text">
              Are you sure you want to delete the file "{fileNameToDelete}"? This action cannot be undone.
            </p>
            <div className="modal-buttons" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="submit-btn" onClick={handleConfirmDelete}>
                Confirm
              </button>
              <button className="cancel-btn" onClick={handleCancelDelete}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isUploading && (
        <div className="modal-overlay">
          <div className="modal-content loading-modal">
            <p className="loading-text">Loading...</p>
            <div className="progress-bar">
              <div key={uploadKey} className="progress-fill"></div>
            </div>
          </div>
        </div>
      )}

      <h1 className="app-title">
        <u>BBIL Production Dashboard – {activeTab === 'daily' ? 'Daily Update' : 'Monthly Update'}</u>
      </h1>

      {/* Navigation Bar */}
      <nav className="top-tabs" role="tablist" aria-label="Upload views">
        <button
          role="tab"
          aria-selected={activeTab === 'monthly'}
          className={`tab-btn ${activeTab === 'monthly' ? 'active' : ''}`}
          onClick={() => setActiveTab('monthly')}
        >
          Monthly Update
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'daily'}
          className={`tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
          onClick={() => setActiveTab('daily')}
        >
          Daily Update
        </button>
      </nav>

      {/* Daily-only banner */}
      {activeTab === 'daily' && (
        <div className="mode-banner" role="status">
          You’re in <strong>Daily Update</strong> mode. Choose the correct segment below:
          <span className="legend">
            <span className="pill pill-ds">DS</span> Drug Substance
            <span className="dot">•</span>
            <span className="pill pill-dp">DP</span> Drug Product
          </span>
        </div>
      )}

      {/* Conditional Rendering Based on Active Tab */}
      {activeTab === 'monthly' ? (
        <div className="container">
          <div className="left-column">
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

            <div className="upload-section">
              <h2>📤 Upload File</h2>
              <div className="upload-form">
                <input
                  type="file"
                  accept=".csv,.pdf,.xlsx,.xls,.doc,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="file-input"
                  disabled={isUploading}
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
                      {getFinancialYearMonths(new Date()).map((monthYear) => (
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
                  onClick={handleMonthlyUpload}
                  disabled={isUploading}
                >
                  {isUploading ? 'Uploading...' : 'Submit File'}
                </button>
              </div>
            </div>
          </div>

          <div className="file-list" style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h2 style={{ margin: 0, marginRight: '10px' }}>📋 List of Files Submitted</h2>
              {userAttributes.username?.toLowerCase() === 'manika5170@bharatbiotech.com' && (
                <label
                  className="delete-option-label"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '16px',
                    color: '#333',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    className="delete-option-checkbox"
                    checked={isDeleteOptionEnabled}
                    onChange={(e) => setIsDeleteOptionEnabled(e.target.checked)}
                    aria-checked={isDeleteOptionEnabled}
                    aria-label="Toggle delete option"
                  />
                  Delete Option
                </label>
              )}
            </div>
            <div className="table-container">
              <table className="file-table">
                <thead>
                  <tr>
                    {columns.map((col) => (
                      !hiddenColumns.includes(col.key) && (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          onContextMenu={(e) => handleContextMenu(e, col.key)}
                          className={sortColumn === col.key ? `sorted-${sortDirection}` : ''}
                        >
                          {col.label}
                        </th>
                      )
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s3Files.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length - hiddenColumns.length} style={{ textAlign: 'center' }}>
                        No files found.
                      </td>
                    </tr>
                  ) : (
                    s3Files.map((file) => (
                      <tr key={file.id}>
                        {!hiddenColumns.includes('id') && <td>{file.id}</td>}
                        {!hiddenColumns.includes('fileName') && (
                          <td
                            data-full-text={file.fileName}
                            onMouseEnter={(e) => handleMouseEnter(e, file.fileName)}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                            className="tooltip-target"
                          >
                            {file.fileName}
                          </td>
                        )}
                        {!hiddenColumns.includes('fileType') && <td>{file.fileType}</td>}
                        {!hiddenColumns.includes('filesize') && <td>{file.filesize}</td>}
                        {!hiddenColumns.includes('dateUploaded') && (
                          <td
                            data-full-text={file.dateUploaded}
                            onMouseEnter={(e) => handleMouseEnter(e, file.dateUploaded)}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                            className="tooltip-target"
                          >
                            {file.dateUploaded}
                          </td>
                        )}
                        {!hiddenColumns.includes('uploadedBy') && <td>{file.uploadedBy}</td>}
                        {!hiddenColumns.includes('fileKey') && (
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
                            {userAttributes.username?.toLowerCase() === 'manika5170@bharatbiotech.com' && isDeleteOptionEnabled && (
                              <>
                                {' / '}
                                <a
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setFileToDelete(file.fileKey);
                                    setFileNameToDelete(file.fileName);
                                    setShowConfirmDeleteModal(true);
                                  }}
                                  className="download-link"
                                  aria-label={`Delete file ${file.fileName}`}
                                >
                                  Delete
                                </a>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="container">
          <div className="left-column">
            {/* Segment A */}
            <div className="upload-section segment segment--ds">
              <h2>📤 Daily Status – Drug Substance (DS)</h2>
              <div className="upload-form">
                <input
                  type="file"
                  accept=".csv,.pdf,.xlsx,.xls,.doc,.docx"
                  onChange={(e) => setDailyFileA(e.target.files?.[0] || null)}
                  className="file-input"
                  disabled={isUploading}
                />
                <button
                  className="upload-btn"
                  onClick={() => handleDailyUpload(dailyFileA, 'DS')}
                  disabled={isUploading}
                >
                  {isUploading ? 'Uploading...' : 'Submit File'}
                </button>
              </div>
            </div>

            {/* Segment B */}
            <div className="upload-section segment segment--dp" style={{ marginTop: '16px' }}>
              <h2>📤 Daily Status – Drug Product (DP)</h2>
              <div className="upload-form">
                <input
                  type="file"
                  accept=".csv,.pdf,.xlsx,.xls,.doc,.docx"
                  onChange={(e) => setDailyFileB(e.target.files?.[0] || null)}
                  className="file-input"
                  disabled={isUploading}
                />
                <button
                  className="upload-btn"
                  onClick={() => handleDailyUpload(dailyFileB, 'DP')}
                  disabled={isUploading}
                >
                  {isUploading ? 'Uploading...' : 'Submit File'}
                </button>
              </div>
            </div>
          </div>

          <div className="file-list" style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h2 style={{ margin: 0, marginRight: '10px' }}>📋 List of Files Submitted</h2>
              {userAttributes.username?.toLowerCase() === 'manika5170@bharatbiotech.com' && (
                <label
                  className="delete-option-label"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '16px',
                    color: '#333',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    className="delete-option-checkbox"
                    checked={isDeleteOptionEnabled}
                    onChange={(e) => setIsDeleteOptionEnabled(e.target.checked)}
                    aria-checked={isDeleteOptionEnabled}
                    aria-label="Toggle delete option"
                  />
                  Delete Option
                </label>
              )}
            </div>
            <div className="table-container">
              <table className="file-table">
                <thead>
                  <tr>
                    {columns.map((col) => (
                      !hiddenColumns.includes(col.key) && (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          onContextMenu={(e) => handleContextMenu(e, col.key)}
                          className={sortColumn === col.key ? `sorted-${sortDirection}` : ''}
                        >
                          {col.label}
                        </th>
                      )
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s3Files.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length - hiddenColumns.length} style={{ textAlign: 'center' }}>
                        No files found.
                      </td>
                    </tr>
                  ) : (
                    s3Files.map((file) => (
                      <tr key={file.id}>
                        {!hiddenColumns.includes('id') && <td>{file.id}</td>}
                        {!hiddenColumns.includes('fileName') && (
                          <td
                            data-full-text={file.fileName}
                            onMouseEnter={(e) => handleMouseEnter(e, file.fileName)}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                            className="tooltip-target"
                          >
                            {file.fileName}
                          </td>
                        )}
                        {!hiddenColumns.includes('fileType') && <td>{file.fileType}</td>}
                        {!hiddenColumns.includes('filesize') && <td>{file.filesize}</td>}
                        {!hiddenColumns.includes('dateUploaded') && (
                          <td
                            data-full-text={file.dateUploaded}
                            onMouseEnter={(e) => handleMouseEnter(e, file.dateUploaded)}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                            className="tooltip-target"
                          >
                            {file.dateUploaded}
                          </td>
                        )}
                        {!hiddenColumns.includes('uploadedBy') && <td>{file.uploadedBy}</td>}
                        {!hiddenColumns.includes('fileKey') && (
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
                            {userAttributes.username?.toLowerCase() === 'manika5170@bharatbiotech.com' && isDeleteOptionEnabled && (
                              <>
                                {' / '}
                                <a
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setFileToDelete(file.fileKey);
                                    setFileNameToDelete(file.fileName);
                                    setShowConfirmDeleteModal(true);
                                  }}
                                  className="download-link"
                                  aria-label={`Delete file ${file.fileName}`}
                                >
                                  Delete
                                </a>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== Footer ===== */}
      <footer className="app-footer" role="contentinfo" aria-label="Support and quick actions">
        <div className="footer-heading">Need help?</div>

        <nav className="footer-actions" aria-label="Footer actions">
          <a
            className="footer-link"
            href={DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the Dashboard in a new tab"
          >
            📊 <span>Dashboard Link</span>
          </a>

          <a
            className="footer-link"
            href={reportMailto}
            aria-label="Report a problem via email"
          >
            🧰 <span>Report a Problem</span>
          </a>

          <a
            className="footer-link"
            href={`tel:${BA_PHONE_TEL}`}
            aria-label="Call Business Analytics Department"
          >
            📞 <span>Call Business Analytics Dept</span>
          </a>

          <a
            className="footer-link"
            href={callbackMailto}
            aria-label="Request a call back via email"
          >
            📥 <span>Request for a Call Back</span>
          </a>
        </nav>
      </footer>

    </main>
    </> 
  );
};

export default App;
