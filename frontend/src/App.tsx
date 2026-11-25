import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  CssBaseline,
  Paper,
  Snackbar,
  Stack,
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from '@mui/material';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RecordTab from './components/RecordTab';
import HistoryTab from './components/HistoryTab';
import SettingsTab from './components/SettingsTab';
import { MealRecord, MealTemplate } from './types';

const AUTH_STORAGE_KEY = 'gain_tracker_auth_token';
const TIMELINE_PAGE_SIZE = 30;

export default function App() {
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'light',
          primary: {
            main: '#ea580c',
          },
          background: {
            default: '#f8fafc',
            paper: '#ffffff',
          },
          text: {
            primary: '#0f172a',
            secondary: '#475569',
          },
        },
        typography: {
          fontFamily:
            '"Inter", "Noto Sans JP", system-ui, -apple-system, sans-serif',
        },
        shape: {
          borderRadius: 12,
        },
      }),
    []
  );

  // Auth states
  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem(AUTH_STORAGE_KEY)
  );
  const [isAuthorized, setIsAuthorized] = useState<boolean>(true);
  const [loginInput, setLoginInput] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Navigation: 0 = 記録, 1 = 履歴, 2 = 設定
  const [activeTab, setActiveTab] = useState<number>(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  // Data states
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [timelineItems, setTimelineItems] = useState<MealRecord[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMoreTimeline, setHasMoreTimeline] = useState<boolean>(false);

  // Notification state
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const showNotify = useCallback(
    (message: string, severity: 'success' | 'error' = 'success') => {
      setSnackbar({ open: true, message, severity });
    },
    []
  );

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers || {});
      if (authToken) {
        headers.set('Authorization', `Bearer ${authToken}`);
      }
      const res = await fetch(url, { ...options, headers });
      return res;
    },
    [authToken]
  );

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await authFetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  }, [authFetch]);

  const fetchTimeline = useCallback(
    async (offset = 0, append = false) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoadingTimeline(true);
      }
      try {
        const res = await authFetch(
          `/api/meals/timeline?limit=${TIMELINE_PAGE_SIZE}&offset=${offset}`
        );
        if (res.ok) {
          const data = await res.json();
          const newItems: MealRecord[] = Array.isArray(data.items)
            ? data.items
            : [];
          setTimelineItems((prev) =>
            append ? [...prev, ...newItems] : newItems
          );
          setHasMoreTimeline(Boolean(data.has_more));
        }
      } catch (err) {
        console.error('Failed to load timeline:', err);
      } finally {
        setIsLoadingTimeline(false);
        setIsLoadingMore(false);
      }
    },
    [authFetch]
  );

  useEffect(() => {
    fetchTemplates();
    fetchTimeline(0, false);
  }, [fetchTemplates, fetchTimeline]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = loginInput.trim();
    if (!token) return;

    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/check', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        localStorage.setItem(AUTH_STORAGE_KEY, token);
        setAuthToken(token);
        setIsAuthorized(true);
        setLoginInput('');
      } else {
        setLoginError('アクセスコードが正しくありません。');
      }
    } catch {
      setLoginError('接続に失敗しました。');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthToken(null);
    setIsAuthorized(false);
    setLoginInput('');
    setLoginError(null);
  };

  const handleDeleteRecord = async (id: string) => {
    const res = await authFetch(`/api/meals/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      showNotify('削除に失敗しました', 'error');
      return;
    }
    setTimelineItems((prev) => prev.filter((item) => item.id !== id));
    showNotify('記録を削除しました', 'success');
  };

  const handleUpdateRecord = async (
    id: string,
    payload: {
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      image_key: string | null;
      logged_date: string;
      logged_time: string;
      meal_type: string;
      dishes: MealRecord['dishes'];
      comment: string | null;
    }
  ) => {
    const res = await authFetch(`/api/meals/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || '記録の更新に失敗しました');
    }
    await fetchTimeline(0, false);
    showNotify('記録を更新しました', 'success');
  };

  const handleRecordSaved = () => {
    fetchTimeline(0, false);
  };

  // Unauthenticated view
  if (!isAuthorized) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Container maxWidth="xs" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
          <Card variant="outlined" sx={{ width: '100%', borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Stack spacing={2.5} sx={{ alignItems: 'center' }}>
                <Box
                  component="img"
                  src="/favicon.png"
                  alt="GainTracker"
                  sx={{ width: 56, height: 56, borderRadius: 2.5 }}
                />
                <Typography
                  variant="h5"
                  color="text.primary"
                  sx={{ fontWeight: 700 }}
                >
                  GainTracker
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ textAlign: 'center' }}
                >
                  アクセスコードを入力してください
                </Typography>

                <Box component="form" onSubmit={handleLogin} sx={{ width: '100%' }}>
                  <Stack spacing={2}>
                    <TextField
                      type="password"
                      label="アクセスコード"
                      fullWidth
                      required
                      value={loginInput}
                      onChange={(e) => setLoginInput(e.target.value)}
                      error={Boolean(loginError)}
                      helperText={loginError}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <LockOutlinedIcon
                              fontSize="small"
                              sx={{ mr: 1, color: 'text.secondary' }}
                            />
                          ),
                        },
                      }}
                    />
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      fullWidth
                      disabled={isLoggingIn || !loginInput.trim()}
                    >
                      {isLoggingIn ? '確認中...' : 'ログイン'}
                    </Button>
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Container>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
          pb: 'calc(72px + env(safe-area-inset-bottom))', // space for fixed BottomNavigation
        }}
      >
        {/* Header with Favicon Logo & Solid Color Title */}
        <AppBar
          position="static"
          elevation={0}
          sx={{
            bgcolor: 'background.paper',
            color: 'text.primary',
            borderBottom: '1px solid',
            borderColor: 'divider',
            pt: 'calc(env(safe-area-inset-top) + 8px)',
          }}
        >
          <Toolbar sx={{ justifyContent: 'center', minHeight: { xs: 44, sm: 48 } }}>
            <Container
              maxWidth="sm"
              disableGutters
              sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}
            >
              <Box
                component="img"
                src="/favicon.png"
                alt="食事管理"
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: 1.25,
                  display: 'block',
                }}
              />
              <Typography
                variant="h6"
                component="h1"
                color="text.primary"
                sx={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.02em' }}
              >
                食事管理
              </Typography>
            </Container>
          </Toolbar>
        </AppBar>

        {/* Main Content */}
        <Container maxWidth="sm" sx={{ py: 2.5, flex: 1 }}>
          {activeTab === 0 && (
            <RecordTab
              templates={templates}
              authFetch={authFetch}
              onSaved={handleRecordSaved}
              onNotify={showNotify}
            />
          )}

          {activeTab === 1 && (
            <HistoryTab
              items={timelineItems}
              templates={templates}
              isLoading={isLoadingTimeline}
              hasMore={hasMoreTimeline}
              isLoadingMore={isLoadingMore}
              authToken={authToken}
              authFetch={authFetch}
              onLoadMore={() => fetchTimeline(timelineItems.length, true)}
              onUpdate={handleUpdateRecord}
              onDelete={handleDeleteRecord}
              onNotify={showNotify}
            />
          )}

          {activeTab === 2 && (
            <SettingsTab
              templates={templates}
              authToken={authToken}
              authFetch={authFetch}
              onTemplatesChanged={fetchTemplates}
              onLogout={handleLogout}
              onNotify={showNotify}
            />
          )}
        </Container>

        {/* Bottom Tab Bar: Left = 記録, Middle = 履歴, Right = 設定 */}
        <Paper
          elevation={3}
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: (t) => t.zIndex.appBar,
            borderTop: '1px solid',
            borderColor: 'divider',
            pb: 'env(safe-area-inset-bottom)',
            bgcolor: 'background.paper',
          }}
        >
          <BottomNavigation
            showLabels
            value={activeTab}
            onChange={(_, newValue: number) => {
              setActiveTab(newValue);
              if (newValue === 1) {
                fetchTimeline(0, false);
              }
            }}
            sx={{ height: 64 }}
          >
            <BottomNavigationAction label="記録" icon={<AddAPhotoIcon />} />
            <BottomNavigationAction label="履歴" icon={<HistoryIcon />} />
            <BottomNavigationAction label="設定" icon={<SettingsIcon />} />
          </BottomNavigation>
        </Paper>

        <Snackbar
          open={snackbar.open}
          autoHideDuration={3000}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert
            severity={snackbar.severity}
            variant="filled"
            onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}
