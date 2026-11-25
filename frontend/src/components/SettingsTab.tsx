import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import { MealTemplate } from '../types';

interface SettingsTabProps {
  templates: MealTemplate[];
  authToken: string | null;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  onTemplatesChanged: () => void;
  onLogout: () => void;
  onNotify: (message: string, severity?: 'success' | 'error') => void;
}

export default function SettingsTab({
  templates,
  authToken,
  authFetch,
  onTemplatesChanged,
  onLogout,
  onNotify,
}: SettingsTabProps) {
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState<string>('');
  const [calories, setCalories] = useState<string>('');
  const [protein, setProtein] = useState<string>('');
  const [fat, setFat] = useState<string>('');
  const [carbs, setCarbs] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const openAddDialog = () => {
    setEditingId(null);
    setName('');
    setCalories('');
    setProtein('');
    setFat('');
    setCarbs('');
    setDialogOpen(true);
  };

  const openEditDialog = (tmpl: MealTemplate) => {
    const firstDish = tmpl.dishes?.[0];
    setEditingId(tmpl.id);
    setName(tmpl.name);
    setCalories(firstDish ? String(firstDish.calories || '') : '');
    setProtein(firstDish ? String(firstDish.protein || '') : '');
    setFat(firstDish ? String(firstDish.fat || '') : '');
    setCarbs(firstDish ? String(firstDish.carbs || '') : '');
    setDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || isSaving) return;

    setIsSaving(true);
    try {
      const res = await authFetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId || undefined,
          name: trimmedName,
          dishes: [
            {
              name: trimmedName,
              calories: Number(calories) || 0,
              protein: Number(protein) || 0,
              carbs: Number(carbs) || 0,
              fat: Number(fat) || 0,
            },
          ],
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'テンプレートの保存に失敗しました');
      }

      setDialogOpen(false);
      onTemplatesChanged();
      onNotify(
        editingId ? 'テンプレートを更新しました' : 'テンプレートを追加しました',
        'success'
      );
    } catch (err: any) {
      onNotify(err.message || 'エラーが発生しました', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      const res = await authFetch(`/api/templates/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('テンプレートの削除に失敗しました');
      }
      onTemplatesChanged();
      onNotify('テンプレートを削除しました', 'success');
    } catch (err: any) {
      onNotify(err.message || '削除に失敗しました', 'error');
    }
  };

  return (
    <Stack spacing={2.5}>
      {/* Templates Management Card */}
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              テンプレート管理
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={openAddDialog}
              sx={{ borderRadius: 2 }}
            >
              追加
            </Button>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            記録画面でワンタップで選べるテンプレートを登録できます。
          </Typography>

          {templates.length === 0 ? (
            <Typography
              variant="body2"
              color="text.disabled"
              sx={{ py: 2, textAlign: 'center' }}
            >
              テンプレートはまだありません
            </Typography>
          ) : (
            <List disablePadding>
              {templates.map((tmpl, index) => (
                <React.Fragment key={tmpl.id}>
                  {index > 0 && <Divider />}
                  <ListItem
                    disableGutters
                    secondaryAction={
                      <Stack direction="row" spacing={0.5}>
                        <IconButton
                          edge="end"
                          aria-label="編集"
                          size="small"
                          onClick={() => openEditDialog(tmpl)}
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          edge="end"
                          aria-label="削除"
                          size="small"
                          color="error"
                          onClick={() => handleDeleteTemplate(tmpl.id)}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    }
                  >
                    <ListItemText
                      primary={tmpl.name}
                      slotProps={{ primary: { sx: { fontWeight: 500 } } }}
                    />
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Account / Auth Card */}
      {authToken && (
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
              アカウント
            </Typography>
            <Button
              variant="outlined"
              color="error"
              startIcon={<LogoutIcon />}
              onClick={onLogout}
              fullWidth
              sx={{ borderRadius: 2 }}
            >
              ログアウト
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Template Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => !isSaving && setDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {editingId ? 'テンプレートを編集' : 'テンプレートを追加'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="テンプレート名"
              placeholder="例: おにぎり、プロテイン"
              fullWidth
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Typography variant="caption" color="text.secondary">
              記録時に内部データとして保存される栄養値（任意）
            </Typography>
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="カロリー (kcal)"
                type="number"
                size="small"
                fullWidth
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
              />
              <TextField
                label="タンパク質 (g)"
                type="number"
                size="small"
                fullWidth
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
              />
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="脂質 (g)"
                type="number"
                size="small"
                fullWidth
                value={fat}
                onChange={(e) => setFat(e.target.value)}
              />
              <TextField
                label="炭水化物 (g)"
                type="number"
                size="small"
                fullWidth
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={isSaving}>
            キャンセル
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveTemplate}
            disabled={!name.trim() || isSaving}
          >
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
