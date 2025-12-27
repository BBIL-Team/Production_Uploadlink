import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getCurrentUser, fetchUserAttributes, updateUserAttributes } from '@aws-amplify/auth';

// --- Footer link helpers (replace with your real values) ---
const DASHBOARD_URL = 'https://your-dashboard-url.example.com'; // TODO: replace
const SUPPORT_EMAIL = 'analytics@bharatbiotech.com';            // TODO: confirm or replace
const BA_PHONE_TEL  = '+914000000000';                          // TODO: replace with real phone in E.164

// ====== APIs ======
const API_BASE = 'https://djtdjzbdtj.execute-api.ap-south-1.amazonaws.com/P1';

const API_LIST_FILES = `${API_BASE}/list-files`;
const API_GET_UPLOADER = `${API_BASE}/get-uploader`;
const API_SAVE_FILES = `${API_BASE}/save-files`;
const API_SETTINGS = `${API_BASE}/settings`;

const API_PRESIGNED = 'https://e3blv3dko6.execute-api.ap-south-1.amazonaws.com/P1/presigned_urls';

const API_MONTHLY_UPLOAD = `${API_BASE}/Production_Uploadlink`;
const API_DAILY_UPLOAD = 'https://1whw41i19a.execute-api.ap-south-1.amazonaws.com/S1/Production_DailyUpload';

// Hardcoded bucket and folder names
const BUCKET_NAME = 'production-bbil';
const DAILY_FOLDER_NAME = 'Production_daily_upload_files_location/';
const MONTHLY_FOLDER_NAME = 'Production_Upload_Files/';

// Supported file extensions
const SUPPORTED_EXTENSIONS = ['.csv', '.pdf', '.xlsx', '.xls', '.doc', '.docx'];

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ===================== (LEGACY) BACKFILL CONFIG =====================
// Keeping these so nothing breaks, but the dropdown is now controlled by backend setting allowBackfill.
// BACKFILL_2025_MODE / BACKFILL_MONTHS_2025 are no longer enforced.
// You can delete later if you want.
const BACKFILL_2025_MODE = true;
const BACKFILL_MONTHS_2025 = [
  'January 2025',
  'February 2025',
  'March 2025',
  'April 2025',
  'May 2025',
  'June 2025',
  'July 2025',
  'August 2025',
  'September 2025',
  'October 2025',
  'November 2025',
];

// Tooltip state
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
  filesize: string;
  dateUploaded: string;   // display
  dateUploadedTs: number; // sorting
  uploadedBy: string;
  fileKey: string;
};

// Context menu state
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  column: keyof FileRow | null;
}

// Helper: fetch with timeout (prevents demo hangs)
async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(id);
  }
}

// Helper: best-effort parse error body
async function readResponseBody(res: Response) {
  const text = await res.text().catch(() => '');
  if (!text) return '';
  try {
    const json = JSON.parse(text);
    return json?.message || json?.error || text;
  } catch {
    return text;
  }
}

// ✅ Month label helpers
const formatMonthYear = (d: Date) => `${months[d.getMonth()]} ${d.getFullYear()}`;

// ✅ last 36 months including current month
const getLast36Months = (currentDate: Date) => {
  const out: string[] = [];
  const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  for (let i = 0; i < 36; i++) {
    out.push(formatMonthYear(d));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
};

// ✅ show: current month + next 4 months
// plus previous month ONLY if today is within first 7 business days of current month
const getNextMonthsWindow = (currentDate: Date) => {
  const out: string[] = [];

  // compute first 7 business days (Mon-Fri) of current month
  const firstOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  let businessDays = 0;
  let thresholdDate = new Date(firstOfMonth);
  while (businessDays < 7) {
    const day = thresholdDate.getDay(); // 0 Sun, 6 Sat
    if (day !== 0 && day !== 6) businessDays++;
    if (businessDays < 7) thresholdDate.setDate(thresholdDate.getDate() + 1);
  }

  // if currentDate <= thresholdDate, include previous month
  if (currentDate <= thresholdDate) {
    const prev = new Date(firstOfMonth);
    prev.setMonth(prev.getMonth() - 1);
    out.push(formatMonthYear(prev));
  }

  // current + next 4
  const d = new Date(firstOfMonth);
  for (let i = 0; i < 5; i++) {
    out.push(formatMonthYear(d));
    d.setMonth(d.getMonth() + 1);
  }

  return Array.from(new Set(out));
};

const App: React.FC = () => {
  const { signOut } = useAuthenticator();

  const [file, setFile] = useState<File | null>(null);
  const [dailyFileA, setDailyFileA] = useState<File | null>(null);
  const [dailyFileB, setDailyFileB] = useState<File | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [displayedMonth, setDisplayedMonth] = useState<string>('');
  const [year, setYear] = useState<number>(2025);

  const [userAttributes, setUserAttributes] = useState<{ username?: string; phoneNumber?: string }>({
    username: '',
    phoneNumber: '',
  });

  const [showUpdateForm, setShowUpdateForm] = useState<boolean>(false);
  const [newUsername, setNewUsername] = useState<string>('');
  const [isLoading, setLoading] = useState(true);

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadKey, setUploadKey] = useState<number>(0);

  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  const [showMessageModal, setShowMessageModal] = useState<boolean>(false);
  const [modalMessage, setModalMessage] = useState<string>('');
  const [modalType, setModalType] = useState<'success' | 'error'>('success');

  const [s3Files, setS3Files] = useState<FileRow[]>([]);
  const [sortColumn, setSortColumn] = useState<keyof FileRow | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [hiddenColumns, setHiddenColumns] = useState<Array<keyof FileRow>>([]);

  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState<boolean>(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [fileNameToDelete, setFileNameToDelete] = useState<string | null>(null);
  const [isDeleteOptionEnabled, setIsDeleteOptionEnabled] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<'monthly' | 'daily'>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('activeTab') : null;
      return saved === 'daily' || saved === 'monthly' ? saved : 'monthly';
    } catch {
      return 'monthly';
    }
  });

  useEffect(() => {
    try { localStorage.setItem('activeTab', activeTab); } catch {}
  }, [activeTab]);

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

  const reportMailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(reportSubject)}&body=${encodeURIComponent(reportBodyRaw)}`;
  const callbackMailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(callbackSubject)}&body=${encodeURIComponent(callbackBodyRaw)}`;

  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, content: '', x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, column: null });

  const handleMouseEnter = (e: React.MouseEvent<HTMLTableCellElement>, content: string) => {
    setTooltip({ visible: true, content, x: e.clientX, y: e.clientY });
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLTableCellElement>) => {
    setTooltip((prev) => ({ ...prev, x: e.clientX, y: e.clientY }));
  };
  const handleMouseLeave = () => setTooltip({ visible: false, content: '', x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent<HTMLTableCellElement>, column: keyof FileRow) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, column });
  };

  const handleHideColumn = () => {
    if (contextMenu.column) {
      setHiddenColumns((prev) => {
        const col = contextMenu.column;
        if (col === null) return prev;
        if (prev.includes(col)) return prev;
        return [...prev, col];
      });
      setContextMenu({ visible: false, x: 0, y: 0, column: null });
    }
  };

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

  const loadS3Files = async (tabOverride?: 'monthly' | 'daily') => {
    const tab = tabOverride || activeTab;
    const folderToUse = tab === 'monthly' ? MONTHLY_FOLDER_NAME : DAILY_FOLDER_NAME;

    try {
      const queryParams = new URLSearchParams({
        bucket_name: BUCKET_NAME,
        folder_name: folderToUse,
      });

      const response = await fetchWithTimeout(
        `${API_LIST_FILES}?${queryParams.toString()}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' }, mode: 'cors', credentials: 'omit' },
        25000
      );

      if (!response.ok) {
        const body = await readResponseBody(response);
        throw new Error(`Failed to fetch S3 files (${response.status}): ${body || response.statusText}`);
      }

      const data = await response.json().catch(() => ({}));

      const filesRaw = await Promise.all(
        (data.files || [])
          .filter((f: { key: string }) => {
            const extension = (f.key.split('.').pop() || '').toLowerCase();
            return SUPPORTED_EXTENSIONS.includes(`.${extension}`);
          })
          .map(async (f: { key: string; size: number; lastModified: string }, index: number) => {
            const fullFileName = f.key.split('/').pop() || '';
            const fileNameParts = fullFileName.split('.');
            const fileName = fileNameParts.slice(0, -1).join('.');
            const fileType = fileNameParts[fileNameParts.length - 1]?.toLowerCase() || '';
            const filesizeKB = (f.size / 1024).toFixed(1) + ' KB';

            const dateUploadedTs = new Date(f.lastModified).getTime();
            const dateUploaded = new Date(f.lastModified).toLocaleString('en-IN', {
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
              const uploaderResponse = await fetchWithTimeout(
                `${API_GET_UPLOADER}?fileName=${encodeURIComponent(fullFileName)}`,
                { method: 'GET', headers: { 'Content-Type': 'application/json' }, mode: 'cors', credentials: 'omit' },
                20000
              );
              if (uploaderResponse.ok) {
                const uploaderData = await uploaderResponse.json().catch(() => ({}));
                uploadedBy =
                  uploaderData.uploadedBy ||
                  uploaderData.user ||
                  uploaderData.username ||
                  uploaderData.uploaded_by ||
                  uploaderData.uploader ||
                  'Unknown';
              }
            } catch {
              // keep Unknown
            }

            return {
              id: index + 1,
              fileName,
              fileType,
              filesize: filesizeKB,
              dateUploaded,
              dateUploadedTs,
              uploadedBy,
              fileKey: f.key,
            } as FileRow;
          })
      );

      const sorted = [...filesRaw].sort((a, b) => b.dateUploadedTs - a.dateUploadedTs);
      const withIds = sorted.map((row, idx) => ({ ...row, id: idx + 1 }));

      setS3Files(withIds);
      setSortColumn('dateUploaded');
      setSortDirection('desc');
    } catch (error: any) {
      console.error('Error fetching S3 files:', error);
      setModalMessage(error?.message || 'Failed to load files from server.');
      setModalType('error');
      setShowMessageModal(true);
    }
  };

  // ✅ Admin check (same as delete)
  const isAdmin = (userAttributes.username || '').toLowerCase() === 'manika5170@bharatbiotech.com';

  // ✅ Global backfill setting from backend (applies across all users/laptops)
  const [allowBackfill, setAllowBackfill] = useState<boolean>(false);
  const [isBackfillLoaded, setIsBackfillLoaded] = useState<boolean>(false);

  const fetchAllowBackfill = async () => {
    try {
      const res = await fetchWithTimeout(
        `${API_SETTINGS}?settingKey=allowBackfill`,
        { method: 'GET', mode: 'cors', credentials: 'omit' },
        15000
      );
      const data = await res.json().catch(() => ({}));
      setAllowBackfill(Boolean(data?.valueBool));
    } catch (e) {
      console.error('fetchAllowBackfill failed', e);
      setAllowBackfill(false);
    } finally {
      setIsBackfillLoaded(true);
    }
  };

  const updateAllowBackfill = async (nextValue: boolean) => {
    try {
      const res = await fetchWithTimeout(
        API_SETTINGS,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            // optional; if your lambda reads this header, it can set updatedBy
            'X-User': userAttributes.username || 'unknown',
          },
          body: JSON.stringify({
            settingKey: 'allowBackfill',
            valueBool: nextValue,
          }),
          mode: 'cors',
          credentials: 'omit',
        },
        20000
      );

      if (!res.ok) {
        const body = await readResponseBody(res);
        throw new Error(body || `PUT /settings failed (HTTP ${res.status})`);
      }

      setAllowBackfill(nextValue);
    } catch (e: any) {
      console.error('updateAllowBackfill failed', e);
      setModalMessage(`Failed to update backfill setting: ${e?.message || 'Unknown error'}`);
      setModalType('error');
      setShowMessageModal(true);
    }
  };

  // Fetch user attributes and initial table + settings
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        await getCurrentUser();
        const attributes: any = await fetchUserAttributes();

        const username = attributes?.preferred_username || attributes?.email || '';
        const phoneNumber = attributes?.phone_number || '';
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
    loadS3Files(activeTab);
    fetchAllowBackfill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload table when switching tabs
  useEffect(() => {
    loadS3Files(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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

  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) {
      setModalMessage('Please enter a valid username.');
      setModalType('error');
      setShowMessageModal(true);
      return;
    }
    try {
      await updateUserAttributes({ userAttributes: { preferred_username: newUsername.trim() } });
      setUserAttributes((prev) => ({ ...prev, username: newUsername.trim() }));
      setShowUpdateForm(false);
      setNewUsername('');
      setModalMessage('Username updated successfully!');
      setModalType('success');
      setShowMessageModal(true);
    } catch (error: any) {
      console.error('Error updating username:', error);
      setModalMessage(`Failed to update username: ${error?.message || 'Unknown error'}`);
      setModalType('error');
      setShowMessageModal(true);
    }
  };

  const validateFile = (f: File | null): boolean => {
    if (f) {
      const extension = (f.name.split('.').pop() || '').toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(`.${extension}`)) return true;
    }
    setModalMessage('Please upload a valid file (.csv, .pdf, .xlsx, .xls, .doc, .docx).');
    setModalType('error');
    setShowMessageModal(true);
    return false;
  };

  const uploadFile = async (
    f: File | null,
    apiUrl: string,
    monthForUpload: string,
    segment?: 'DS' | 'DP',
    monthLabelForLog?: string
  ) => {
    if (!f) {
      setModalMessage('Please select a file to upload.');
      setModalType('error');
      setShowMessageModal(true);
      return;
    }

    const originalFileName = f.name;

    // IMPORTANT: multipart/form-data
    const formData = new FormData();
    formData.append('file', f);
    formData.append('month', monthForUpload);
    if (segment) formData.append('segment', segment);
    formData.append('fileName', originalFileName);
    formData.append('username', userAttributes.username || 'Unknown');

    // ✅ backfill info for backend (safe even if backend ignores)
    formData.append('allowBackfill', allowBackfill ? 'true' : 'false');
    if (monthLabelForLog) formData.append('monthLabel', monthLabelForLog);

    try {
      setIsUploading(true);
      setUploadKey((prev) => prev + 1);

      const res = await fetchWithTimeout(
        apiUrl,
        {
          method: 'POST',
          body: formData,
          mode: 'cors',
          credentials: 'omit',
          // DO NOT set Content-Type manually for FormData.
        },
        45000
      );

      if (!res.ok) {
        const body = await readResponseBody(res);
        setModalMessage(body || `Failed to upload file (HTTP ${res.status})`);
        setModalType('error');
        setShowMessageModal(true);
        return;
      }

      const uploadData = await res.json().catch(() => ({}));
      setModalMessage(uploadData.message || 'File uploaded successfully!');
      setModalType('success');
      setShowMessageModal(true);

      // ✅ For "Uploaded By" to resolve, log the SAME basename that ends up in S3.
      // Adjust this if your backend uses a different naming rule.
      const uploadType = monthForUpload === 'Daily' ? 'daily' : 'monthly';

      const savedBasename =
        uploadType === 'monthly' && allowBackfill
          ? `${String(monthLabelForLog || '').trim().replace(/\s+/g, '_')}_Planned_vs_Achieved_.csv`
          : uploadType === 'monthly'
            ? 'current_file.csv'
            : originalFileName;

      // Upload log (best effort)
      try {
        await fetchWithTimeout(
          API_SAVE_FILES,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: savedBasename,
              action: 'upload',
              user: userAttributes.username || 'Unknown',
              uploadType,
              segment: segment || undefined,
              month: uploadType === 'monthly' ? (monthLabelForLog || monthForUpload) : undefined,
              allowBackfill: uploadType === 'monthly' ? allowBackfill : undefined,
            }),
            mode: 'cors',
            credentials: 'omit',
          },
          20000
        );
      } catch (e) {
        console.warn('Upload saved, but failed to save upload log:', e);
      }

      await loadS3Files(activeTab);
    } catch (error: any) {
      console.error('Upload error:', error);
      const msg =
        error?.name === 'AbortError'
          ? 'Upload timed out (network slow or API not responding).'
          : (error?.message || 'Failed to fetch');

      setModalMessage(`An error occurred while uploading the file: ${msg}`);
      setModalType('error');
      setShowMessageModal(true);
    } finally {
      setIsUploading(false);
    }
  };

  const handleMonthlyUpload = () => {
    if (!selectedMonth) {
      setModalMessage('Please select the correct month.');
      setModalType('error');
      setShowMessageModal(true);
      return;
    }

    // ✅ No longer restrict by BACKFILL_MONTHS_2025; dropdown itself is controlled by allowBackfill.
    // If you still want strict Jan-Nov 2025 restriction, re-enable your old check here.

    if (validateFile(file)) {
      const monthName = selectedMonth.split(' ')[0]; // backend expects month name only (keep current behavior)
      uploadFile(file, API_MONTHLY_UPLOAD, monthName, undefined, selectedMonth);
    }
  };

  const handleDailyUpload = (f: File | null, segment: 'DS' | 'DP') => {
    if (validateFile(f)) {
      uploadFile(f, API_DAILY_UPLOAD, 'Daily', segment);
    }
  };

  const downloadFile = async (key: string, isMonth = false) => {
    try {
      const fileKey = isMonth ? `Production_Sample_Files/${key}_Sample_File.csv` : key;

      const res = await fetchWithTimeout(
        API_PRESIGNED,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bucket_name: BUCKET_NAME,
            file_key: fileKey,
            action: 'download',
            isSample: isMonth,
          }),
          mode: 'cors',
          credentials: 'omit',
        },
        25000
      );

      const dataText = await res.text().catch(() => '');
      let data: any = {};
      try { data = dataText ? JSON.parse(dataText) : {}; } catch { data = { raw: dataText }; }

      if (res.ok && data.presigned_url) {
        const link = document.createElement('a');
        link.href = data.presigned_url;
        link.download = fileKey.split('/').pop() || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Best-effort download logging
        try {
          await fetchWithTimeout(
            API_SAVE_FILES,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileName: fileKey.split('/').pop(),
                action: 'download',
                user: userAttributes.username || 'Unknown',
              }),
              mode: 'cors',
              credentials: 'omit',
            },
            15000
          );
        } catch {}

        setModalMessage(`Downloaded ${fileKey.split('/').pop()} successfully!`);
        setModalType('success');
        setShowMessageModal(true);
      } else {
        const errMsg = data?.error || data?.message || dataText || `HTTP ${res.status}`;
        setModalMessage(`Error: ${errMsg}`);
        setModalType('error');
        setShowMessageModal(true);
      }
    } catch (error: any) {
      setModalMessage(`An error occurred while fetching the download link: ${error?.message || 'Unknown error'}`);
      setModalType('error');
      setShowMessageModal(true);
    }
  };

  const deleteFile = async (key: string) => {
    try {
      const res = await fetchWithTimeout(
        API_PRESIGNED,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bucket_name: BUCKET_NAME, file_key: key, action: 'delete' }),
          mode: 'cors',
          credentials: 'omit',
        },
        25000
      );

      if (res.ok) {
        setModalMessage(`File ${key.split('/').pop()} deleted successfully!`);
        setModalType('success');
        setShowMessageModal(true);
        await loadS3Files(activeTab);
      } else {
        const body = await readResponseBody(res);
        setModalMessage(`Failed to delete file: ${body || res.statusText}`);
        setModalType('error');
        setShowMessageModal(true);
      }
    } catch (error: any) {
      setModalMessage(`An error occurred while deleting the file: ${error?.message || 'Unknown error'}`);
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

  const handlePreviousYear = () => setYear((prev) => prev - 1);
  const handleNextYear = () => setYear((prev) => prev + 1);

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
          ? a.dateUploadedTs - b.dateUploadedTs
          : b.dateUploadedTs - a.dateUploadedTs;
      }

      return newDirection === 'asc'
        ? String(valueA).localeCompare(String(valueB))
        : String(valueB).localeCompare(String(valueA));
    });

    const withIds = sortedFiles.map((row, idx) => ({ ...row, id: idx + 1 }));
    setS3Files(withIds);
  };

  const columns: Array<{ key: keyof FileRow; label: string }> = [
    { key: 'id', label: 'S.No.' },
    { key: 'fileName', label: 'File Name' },
    { key: 'fileType', label: 'File Type' },
    { key: 'filesize', label: 'Filesize' },
    { key: 'dateUploaded', label: 'Date Uploaded' },
    { key: 'uploadedBy', label: 'Uploaded By' },
    { key: 'fileKey', label: 'Download Link' },
  ];

  // header height CSS var
  const headerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const updateVar = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--header-h', `${h}px`);
    };

    updateVar();
    const ro = new ResizeObserver(updateVar);
    ro.observe(el);

    window.addEventListener('resize', updateVar);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateVar);
    };
  }, []);

  return (
    <>
      <header ref={headerRef} className={`app-header ${activeTab === 'daily' ? 'daily-theme' : ''}`}>
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

      <main className={`app-main ${activeTab === 'daily' ? 'daily-theme' : ''}`}>
        {tooltip.visible && (
          <div className="tooltip" style={{ left: `${tooltip.x + 10}px`, top: `${tooltip.y + 10}px` }}>
            {tooltip.content}
          </div>
        )}

        {contextMenu.visible && (
          <div ref={contextMenuRef} className="context-menu" style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}>
            <div className="context-menu-item" onClick={handleHideColumn}>Hide Column</div>
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
              <button className="ok-btn" onClick={closeMessageModal}>OK</button>
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
                <button className="submit-btn" onClick={handleConfirmDelete}>Confirm</button>
                <button className="cancel-btn" onClick={handleCancelDelete}>Cancel</button>
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

        {activeTab === 'monthly' ? (
          <div className="container">
            <div className="left-column">
              <div className="calendar-section">
                <h2>Sample File Download Segment</h2>
                <div className="year-navigation">
                  <button onClick={() => setYear((prev) => prev - 1)}>{'\u003C'}</button>
                  <h2>{year}</h2>
                  <button onClick={() => setYear((prev) => prev + 1)}>{'\u003E'}</button>
                </div>
                <div className="months-grid">
                  {months.map((m) => (
                    <button
                      key={m}
                      onClick={() => setDisplayedMonth(m === displayedMonth ? '' : m)}
                      className={`month-button ${displayedMonth === m ? 'active-month' : ''}`}
                    >
                      {m}
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
                        {(allowBackfill ? getLast36Months(new Date()) : getNextMonthsWindow(new Date())).map((monthYear) => (
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

                  <button className="upload-btn" onClick={handleMonthlyUpload} disabled={isUploading}>
                    {isUploading ? 'Uploading...' : 'Submit File'}
                  </button>
                </div>
              </div>
            </div>

            <div className="file-list" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h2 style={{ margin: 0, marginRight: '10px' }}>📋 List of Files Submitted</h2>

                {isAdmin && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <label
                      className="delete-option-label"
                      style={{ display: 'flex', alignItems: 'center', fontSize: '16px', color: '#333', cursor: 'pointer' }}
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

                    <label
                      className="delete-option-label"
                      style={{ display: 'flex', alignItems: 'center', fontSize: '16px', color: '#333', cursor: 'pointer', gap: '8px' }}
                      title="Global setting (applies to all users). ON = last 3 years. OFF = limited window."
                    >
                      <input
                        type="checkbox"
                        className="delete-option-checkbox"
                        checked={allowBackfill}
                        onChange={(e) => updateAllowBackfill(e.target.checked)}
                        disabled={!isBackfillLoaded}
                        aria-checked={allowBackfill}
                        aria-label="Toggle allow backfill"
                      />
                      Allow Backfill
                    </label>
                  </div>
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
                      s3Files.map((row) => (
                        <tr key={row.id}>
                          {!hiddenColumns.includes('id') && <td>{row.id}</td>}
                          {!hiddenColumns.includes('fileName') && (
                            <td
                              data-full-text={row.fileName}
                              onMouseEnter={(e) => handleMouseEnter(e, row.fileName)}
                              onMouseMove={handleMouseMove}
                              onMouseLeave={handleMouseLeave}
                              className="tooltip-target"
                            >
                              {row.fileName}
                            </td>
                          )}
                          {!hiddenColumns.includes('fileType') && <td>{row.fileType}</td>}
                          {!hiddenColumns.includes('filesize') && <td>{row.filesize}</td>}
                          {!hiddenColumns.includes('dateUploaded') && (
                            <td
                              data-full-text={row.dateUploaded}
                              onMouseEnter={(e) => handleMouseEnter(e, row.dateUploaded)}
                              onMouseMove={handleMouseMove}
                              onMouseLeave={handleMouseLeave}
                              className="tooltip-target"
                            >
                              {row.dateUploaded}
                            </td>
                          )}
                          {!hiddenColumns.includes('uploadedBy') && <td>{row.uploadedBy}</td>}
                          {!hiddenColumns.includes('fileKey') && (
                            <td>
                              <a
                                href="#"
                                onClick={(e) => { e.preventDefault(); downloadFile(row.fileKey); }}
                                className="download-link"
                              >
                                Download
                              </a>

                              {isAdmin && isDeleteOptionEnabled && (
                                <>
                                  {' / '}
                                  <a
                                    href="#"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setFileToDelete(row.fileKey);
                                      setFileNameToDelete(row.fileName);
                                      setShowConfirmDeleteModal(true);
                                    }}
                                    className="download-link"
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
                  <button className="upload-btn" onClick={() => handleDailyUpload(dailyFileA, 'DS')} disabled={isUploading}>
                    {isUploading ? 'Uploading...' : 'Submit File'}
                  </button>
                </div>
              </div>

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
                  <button className="upload-btn" onClick={() => handleDailyUpload(dailyFileB, 'DP')} disabled={isUploading}>
                    {isUploading ? 'Uploading...' : 'Submit File'}
                  </button>
                </div>
              </div>
            </div>

            <div className="file-list" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h2 style={{ margin: 0, marginRight: '10px' }}>📋 List of Files Submitted</h2>
                {isAdmin && (
                  <label
                    className="delete-option-label"
                    style={{ display: 'flex', alignItems: 'center', fontSize: '16px', color: '#333', cursor: 'pointer' }}
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
                      s3Files.map((row) => (
                        <tr key={row.id}>
                          {!hiddenColumns.includes('id') && <td>{row.id}</td>}
                          {!hiddenColumns.includes('fileName') && (
                            <td
                              data-full-text={row.fileName}
                              onMouseEnter={(e) => handleMouseEnter(e, row.fileName)}
                              onMouseMove={handleMouseMove}
                              onMouseLeave={handleMouseLeave}
                              className="tooltip-target"
                            >
                              {row.fileName}
                            </td>
                          )}
                          {!hiddenColumns.includes('fileType') && <td>{row.fileType}</td>}
                          {!hiddenColumns.includes('filesize') && <td>{row.filesize}</td>}
                          {!hiddenColumns.includes('dateUploaded') && (
                            <td
                              data-full-text={row.dateUploaded}
                              onMouseEnter={(e) => handleMouseEnter(e, row.dateUploaded)}
                              onMouseMove={handleMouseMove}
                              onMouseLeave={handleMouseLeave}
                              className="tooltip-target"
                            >
                              {row.dateUploaded}
                            </td>
                          )}
                          {!hiddenColumns.includes('uploadedBy') && <td>{row.uploadedBy}</td>}
                          {!hiddenColumns.includes('fileKey') && (
                            <td>
                              <a
                                href="#"
                                onClick={(e) => { e.preventDefault(); downloadFile(row.fileKey); }}
                                className="download-link"
                              >
                                Download
                              </a>

                              {isAdmin && isDeleteOptionEnabled && (
                                <>
                                  {' / '}
                                  <a
                                    href="#"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setFileToDelete(row.fileKey);
                                      setFileNameToDelete(row.fileName);
                                      setShowConfirmDeleteModal(true);
                                    }}
                                    className="download-link"
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

        <footer className="app-footer" role="contentinfo" aria-label="Support and quick actions">
          <div className="footer-heading">Need help?</div>

          <nav className="footer-actions" aria-label="Footer actions">
            <a className="footer-link" href={DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
              📊 <span>Dashboard Link</span>
            </a>

            <a className="footer-link" href={reportMailto}>
              🧰 <span>Report a Problem</span>
            </a>

            <a className="footer-link" href={`tel:${BA_PHONE_TEL}`}>
              📞 <span>Call Business Analytics Dept</span>
            </a>

            <a className="footer-link" href={callbackMailto}>
              📥 <span>Request for a Call Back</span>
            </a>
          </nav>
        </footer>
      </main>
    </>
  );
};

export default App;
