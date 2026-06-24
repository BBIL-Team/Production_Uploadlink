import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getCurrentUser, fetchUserAttributes, updateUserAttributes } from '@aws-amplify/auth';

// --- Footer link helpers (replace with your real values) ---
const DASHBOARD_URL = 'https://ap-south-1.quicksight.aws.amazon.com/sn/account/bbil-dashboards/dashboards/88001d2d-9daa-477d-8301-7418de873115/sheets/88001d2d-9daa-477d-8301-7418de873115_298b1a92-4fc0-4e5f-9938-8664fb6fd34b'; // TODO: replace
const SUPPORT_EMAIL = 'analytics@bharatbiotech.com'; // TODO: confirm or replace
const BA_PHONE_TEL = '+914000000000'; // TODO: replace with real phone in E.164

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
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
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
  dateUploaded: string; // display
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

// ✅ Backfill dropdown: show all months of previous calendar year + current month (ascending)
// Example if today is Jan 2026 => Jan 2025..Dec 2025, Jan 2026
const getBackfillMonths = (currentDate: Date) => {
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const prevYear = currentYear - 1;

  const items: Array<{ ts: number; label: string }> = [];

  // Jan..Dec of previous year
  for (let m = 0; m < 12; m++) {
    const d = new Date(prevYear, m, 1);
    items.push({ ts: d.getTime(), label: formatMonthYear(d) });
  }

  // Jan..current month of current year
  for (let m = 0; m <= currentMonth; m++) {
    const d = new Date(currentYear, m, 1);
    items.push({ ts: d.getTime(), label: formatMonthYear(d) });
  }

  return items.sort((a, b) => a.ts - b.ts).map((x) => x.label);
};

// ✅ show: current month + next 4 months
// plus previous month ONLY if today is within first 7 business days of current month
// ✅ show:
// - Until 7th of the month (inclusive): previous month + current month
// - From 8th onwards: ONLY current month
// Always return ascending order.
const getNextMonthsWindow = (currentDate: Date) => {
  const out: string[] = [];

  const firstOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const currentLabel = formatMonthYear(firstOfMonth);

  // Calendar-day rule (not business days):
  // If today is 1..7 (inclusive), allow previous month as well
  const dayOfMonth = currentDate.getDate();
  if (dayOfMonth <= 7) {
    const prev = new Date(firstOfMonth);
    prev.setMonth(prev.getMonth() - 1);
    out.push(formatMonthYear(prev));
  }

  out.push(currentLabel);

  // Ensure unique + ascending (prev, current)
  return Array.from(new Set(out));
};



// ✅ Daily sample week helpers
// Weeks follow calendar weeks from Monday to Sunday.
// Example: July 2026 Week 1 = 29 Jun 2026 to 05 Jul 2026.
type DailyWeekInfo = {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  label: string;
  fileKey: string;
  isPast: boolean;
  isCurrent: boolean;
  isFuture: boolean;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const addDays = (d: Date, days: number) => {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
};

const getMondayOfWeek = (d: Date) => {
  const day = d.getDay(); // Sunday = 0, Monday = 1, ... Saturday = 6
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(d, diffToMonday);
};

const formatWeekDate = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });

const getDailySampleFileKey = (year: number, monthNumber: number, weekNumber: number) => {
  const monthToken = String(monthNumber).padStart(2, '0');
  return `Production_Sample_Files/Daily_Update_Sample_Files/${year}_${monthToken}_Week_${weekNumber}_Sample_File.xlsx`;
};

const getDailySampleWeeks = (monthDate: Date, today: Date = new Date()): DailyWeekInfo[] => {
  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const monthNumber = monthIndex + 1;

  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0);

  // Start from the Monday of the week that contains the 1st of the selected month.
  // This means a month can start with a previous-month date, e.g. July 2026 starts at 29 Jun.
  const firstMonday = getMondayOfWeek(firstDayOfMonth);
  const todayStart = startOfDay(today);
  const weeks: DailyWeekInfo[] = [];

  let weekStart = firstMonday;
  let weekNumber = 1;

  while (weekStart <= lastDayOfMonth) {
    const startDate = startOfDay(weekStart);
    const endDate = addDays(startDate, 6);

    const isPast = startOfDay(endDate) < todayStart;
    const isCurrent = startDate <= todayStart && todayStart <= startOfDay(endDate);
    const isFuture = startDate > todayStart;

    weeks.push({
      weekNumber,
      startDate,
      endDate,
      label: `Week ${weekNumber} (${formatWeekDate(startDate)} - ${formatWeekDate(endDate)})`,
      fileKey: getDailySampleFileKey(year, monthNumber, weekNumber),
      isPast,
      isCurrent,
      isFuture,
    });

    weekStart = addDays(weekStart, 7);
    weekNumber += 1;
  }

  return weeks;
};

// ✅ Month token helper for CSV validation (e.g., "January 2026" -> "Jan-26")
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;

const monthYearLabelToToken = (label: string): string => {
  const parts = String(label || '').trim().split(/\s+/);
  if (parts.length < 2) return '';
  const monthName = parts[0];
  const yearPart = parts[1];

  const monthIndex = months.findIndex((m) => m.toLowerCase() === monthName.toLowerCase());
  if (monthIndex < 0) return '';
  const yy = yearPart.slice(-2);
  return `${MONTHS_SHORT[monthIndex]}-${yy}`;
};

const normalizeCsvHeader = (s: string): string => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Basic CSV line parser (handles quoted commas)
const parseCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      // Escaped quote inside quoted field
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out;
};

const validateMonthlyCsvMonthColumn = async (
  f: File,
  expectedToken: string
): Promise<{ ok: boolean; message?: string }> => {
  // Only validate CSV files
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (ext !== 'csv') return { ok: true };

  if (!expectedToken) {
    return { ok: false, message: 'Internal error: unable to derive expected Month & Year token from selected month.' };
  }

  // Read file text (limit parsing to first ~250k chars to avoid huge files)
  const rawFull = await f.text();
  const raw = rawFull.slice(0, 250_000);

  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
  const lines = normalized.split('\n').filter((l) => l.trim() !== '');

  if (lines.length < 2) {
    return { ok: false, message: 'Validation failed: CSV appears empty or header row is missing.' };
  }

  const headerCols = parseCsvLine(lines[0]).map((h) => String(h || '').trim());
  const targetKey = 'monthyear';
  const colIndex = headerCols.findIndex((h) => normalizeCsvHeader(h) === targetKey);

  if (colIndex < 0) {
    return {
      ok: false,
      message: `Validation failed: Could not find required column "Month & Year" in the CSV header.`,
    };
  }

  // Validate all non-empty values are exactly the expected token
  const maxRowsToCheck = 5000;
  let checked = 0;

  for (let i = 1; i < lines.length && checked < maxRowsToCheck; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cols = parseCsvLine(line);
    const valRaw = (cols[colIndex] ?? '').trim();

    // Skip empty cells
    if (!valRaw) continue;

    const val = valRaw.replace(/^"|"$/g, '').trim();

    if (val !== expectedToken) {
      return {
        ok: false,
        message: `Validation failed: Column "Month & Year" must be "${expectedToken}" for the selected month, but found "${val}" (row ${i + 1}).`,
      };
    }

    checked++;
  }

  return { ok: true };
};

const App: React.FC = () => {
  const { signOut } = useAuthenticator();

  const [file, setFile] = useState<File | null>(null);
  const [dailyFileA, setDailyFileA] = useState<File | null>(null);
  const [dailyFileB, setDailyFileB] = useState<File | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [displayedMonth, setDisplayedMonth] = useState<string>('');
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [dailySampleMonthDate, setDailySampleMonthDate] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

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
    try {
      localStorage.setItem('activeTab', activeTab);
    } catch {}
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

  const reportMailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(reportSubject)}&body=${encodeURIComponent(
    reportBodyRaw
  )}`;
  const callbackMailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(callbackSubject)}&body=${encodeURIComponent(
    callbackBodyRaw
  )}`;

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

  // ✅ Normalize username for header
  const getXUser = () => String(userAttributes.username || '').trim();

  // ✅ If the upload month dropdown options change, clear a previously selected month
  // that is no longer allowed. This avoids submitting an old/backfill month after
  // the global Allow Backfill setting is switched OFF.
  useEffect(() => {
    if (!selectedMonth) return;

    const allowedMonths = allowBackfill ? getBackfillMonths(new Date()) : getNextMonthsWindow(new Date());
    if (!allowedMonths.includes(selectedMonth)) {
      setSelectedMonth('');
      setIsDropdownOpen(false);
    }
  }, [allowBackfill, selectedMonth]);

  const fetchAllowBackfill = async () => {
    try {
      const res = await fetchWithTimeout(
        `${API_SETTINGS}?settingKey=allowBackfill`,
        {
          method: 'GET',
          headers: {
            // Not required by lambda for GET, but harmless + helps consistency
            'X-User': getXUser(),
          },
          mode: 'cors',
          credentials: 'omit',
        },
        15000
      );

      if (!res.ok) {
        const body = await readResponseBody(res);
        throw new Error(body || `GET /settings failed (HTTP ${res.status})`);
      }

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
    // optimistic UI (optional) — comment these 2 lines if you don’t want optimistic updates
    const prev = allowBackfill;
    setAllowBackfill(nextValue);

    try {
      const xUser = getXUser();
      if (!xUser) {
        throw new Error('Missing username (X-User). Please login again.');
      }

      const res = await fetchWithTimeout(
        API_SETTINGS,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            // ✅ This is REQUIRED by your BBIL_Settings lambda for admin auth
            'X-User': xUser,
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

      // Keep state in sync with backend response (in case backend changes it)
      const data = await res.json().catch(() => ({}));
      if (typeof data?.valueBool === 'boolean') setAllowBackfill(Boolean(data.valueBool));
    } catch (e: any) {
      console.error('updateAllowBackfill failed', e);

      // revert optimistic update
      setAllowBackfill(prev);

      setModalMessage(`Failed to update backfill setting: ${e?.message || 'Unknown error'}`);
      setModalType('error');
      setShowMessageModal(true);
    }
  };

  // Fetch user attributes and initial table
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        await getCurrentUser();
        const attributes: any = await fetchUserAttributes();

        const username = attributes?.preferred_username || attributes?.email || '';
        const phoneNumber = attributes?.phone_number || '';
        const maskedPhoneNumber =
          phoneNumber && phoneNumber.length >= 2 ? `91${'x'.repeat(phoneNumber.length - 4)}${phoneNumber.slice(-2)}` : '';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Fetch allowBackfill only AFTER we have username (fixes “Failed to fetch” / 403 confusion)
  useEffect(() => {
    if (!userAttributes.username) return;
    fetchAllowBackfill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAttributes.username]);

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

    // keep as username (your python lambda reads fields.get("username"))
    formData.append('username', userAttributes.username || 'Unknown');

    // ✅ backfill info for backend
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

      const uploadType = monthForUpload === 'Daily' ? 'daily' : 'monthly';

      // NOTE: your python lambda writes:
      //  - backfill -> "{Dec_2025}_Planned_vs_Achieved.csv"
      //  - normal -> "current_file.csv"
      // So log names should match that.
      const savedBasename =
        uploadType === 'monthly' && allowBackfill
          ? `${String(monthLabelForLog || '').trim().replace(/\s+/g, '_')}_Planned_vs_Achieved.csv`
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
          : error?.message || 'Failed to fetch';

      setModalMessage(`An error occurred while uploading the file: ${msg}`);
      setModalType('error');
      setShowMessageModal(true);
    } finally {
      setIsUploading(false);
    }
  };

  const handleMonthlyUpload = async () => {
    if (!selectedMonth) {
      setModalMessage('Please select the correct month.');
      setModalType('error');
      setShowMessageModal(true);
      return;
    }

    if (!validateFile(file)) return;

    // ✅ Validate Month & Year column against selected dropdown month (CSV only)
    try {
      const expectedToken = monthYearLabelToToken(selectedMonth); // e.g., "January 2026" -> "Jan-26"
      const result = await validateMonthlyCsvMonthColumn(file as File, expectedToken);
      if (!result.ok) {
        setModalMessage(result.message || 'Validation failed for Month & Year column.');
        setModalType('error');
        setShowMessageModal(true);
        return;
      }
    } catch (e: any) {
      console.error('Month & Year validation failed:', e);
      setModalMessage(`Validation failed: ${e?.message || 'Unable to read/validate the CSV file.'}`);
      setModalType('error');
      setShowMessageModal(true);
      return;
    }

    const monthName = selectedMonth.split(' ')[0]; // backend expects month name only (keep current behavior)
    uploadFile(file, API_MONTHLY_UPLOAD, monthName, undefined, selectedMonth);
  };
  const handleDailyUpload = (f: File | null, segment: 'DS' | 'DP') => {
    if (validateFile(f)) {
      uploadFile(f, API_DAILY_UPLOAD, 'Daily', segment);
    }
  };

  const downloadDailyWeekSample = async (weekInfo: DailyWeekInfo) => {
    if (weekInfo.isPast) {
      setModalMessage(`${weekInfo.label} is already completed as per calendar, so the sample download is disabled.`);
      setModalType('error');
      setShowMessageModal(true);
      return;
    }

    await downloadFile(weekInfo.fileKey, false, true);
  };

  const downloadFile = async (key: string, isMonth = false, isExplicitSample = false) => {
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
            isSample: isMonth || isExplicitSample,
          }),
          mode: 'cors',
          credentials: 'omit',
        },
        25000
      );

      const dataText = await res.text().catch(() => '');
      let data: any = {};
      try {
        data = dataText ? JSON.parse(dataText) : {};
      } catch {
        data = { raw: dataText };
      }

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
        return newDirection === 'asc' ? a.dateUploadedTs - b.dateUploadedTs : b.dateUploadedTs - a.dateUploadedTs;
      }

      return newDirection === 'asc' ? String(valueA).localeCompare(String(valueB)) : String(valueB).localeCompare(String(valueA));
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


  const dailySampleWeeks = getDailySampleWeeks(dailySampleMonthDate);
  const dailySampleMonthLabel = formatMonthYear(dailySampleMonthDate);

  const goPrevDailySampleMonth = () => {
    setDailySampleMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goNextDailySampleMonth = () => {
    setDailySampleMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

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
          <button className="sign-out-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main
        className={`app-main ${activeTab === 'daily' ? 'daily-theme' : ''}`}
        style={{
          // The header/logo bar is fixed/overlaying the page in your CSS.
          // Daily currently needs extra clearance, but Monthly should keep the normal compact top spacing.
          paddingTop:
            activeTab === 'daily'
              ? 'calc(var(--header-h, 110px) + 524px)'
              : 'calc(var(--header-h, 110px) + 24px)',
          boxSizing: 'border-box',
        }}
      >
        {tooltip.visible && (
          <div className="tooltip" style={{ left: `${tooltip.x + 10}px`, top: `${tooltip.y + 10}px` }}>
            {tooltip.content}
          </div>
        )}

        {contextMenu.visible && (
          <div ref={contextMenuRef} className="context-menu" style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}>
            <div className="context-menu-item" onClick={handleHideColumn}>
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
                  <button type="submit" className="submit-btn">
                    Submit
                  </button>
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
              <p className={`message-text ${modalType === 'success' ? 'success-text' : 'error-text'}`}>{modalMessage}</p>
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
                Are you sure you want to delete the file &quot;{fileNameToDelete}&quot;? This action cannot be undone.
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

        <div
          style={{
            width: '100%',
            margin: '0 auto 18px auto',
            position: 'relative',
            zIndex: 20,
          }}
        >
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
        </div>

        {activeTab === 'daily' && (
          <div className="mode-banner" role="status">
            You’re in <strong>Daily Update</strong> mode. Choose the correct segment below:
            <span className="legend">
              <span className="pill pill-ds">DS</span> Drug Substance <span className="dot">•</span>{' '}
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
                        {(allowBackfill ? getBackfillMonths(new Date()) : getNextMonthsWindow(new Date())).map((monthYear) => (
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
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '16px',
                        color: '#333',
                        cursor: 'pointer',
                        gap: '8px',
                      }}
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
                      {columns.map(
                        (col) =>
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
                      )}
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
                                onClick={(e) => {
                                  e.preventDefault();
                                  downloadFile(row.fileKey);
                                }}
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
              <div className="calendar-section" style={{ marginBottom: '16px' }}>
                <h2>Sample File Download (Daily)</h2>
                <div className="year-navigation">
                  <button onClick={goPrevDailySampleMonth}>{'\u003C'}</button>
                  <h2>{dailySampleMonthLabel}</h2>
                  <button onClick={goNextDailySampleMonth}>{'\u003E'}</button>
                </div>

                <p style={{ margin: '8px 0 14px 0', color: '#444', fontSize: '14px', lineHeight: 1.4 }}>
                  Download the weekly daily-upload sample file. Weeks run Monday to Sunday; completed weeks are greyed out automatically.
                </p>

                <div className="months-grid">
                  {dailySampleWeeks.map((week) => {
                    const disabled = week.isPast;
                    return (
                      <button
                        key={week.weekNumber}
                        className={`month-button ${week.isCurrent ? 'active-month' : ''}`}
                        onClick={() => downloadDailyWeekSample(week)}
                        disabled={disabled}
                        style={{
                          minHeight: '76px',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          filter: disabled ? 'grayscale(1)' : 'none',
                          opacity: disabled ? 0.55 : 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                        }}
                        title={disabled ? 'Previous completed week downloads are disabled' : `Download ${week.label} sample file`}
                      >
                        <span style={{ fontWeight: 700 }}>Week {week.weekNumber}</span>
                        <span style={{ fontSize: '12px', lineHeight: 1.25 }}>
                          {formatWeekDate(week.startDate)} - {formatWeekDate(week.endDate)}
                        </span>
                        <span style={{ fontSize: '11px', lineHeight: 1.2 }}>
                          {week.isPast ? 'Completed' : week.isCurrent ? 'Current' : 'Upcoming'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

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
                      {columns.map(
                        (col) =>
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
                      )}
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
                                onClick={(e) => {
                                  e.preventDefault();
                                  downloadFile(row.fileKey);
                                }}
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
