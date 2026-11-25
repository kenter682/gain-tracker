import React, { useRef, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CloseIcon from '@mui/icons-material/Close';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import { Dish, MealRecord, MealTemplate } from '../types';
import { formatTimelineDateTime, resizeImageTo1280x960 } from '../utils/image';

export interface MealUpdatePayload {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  image_key: string | null;
  logged_date: string;
  logged_time: string;
  meal_type: string;
  dishes: Dish[] | null;
  comment: string | null;
}

interface HistoryTabProps {
  items: MealRecord[];
  templates: MealTemplate[];
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  authToken: string | null;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  onLoadMore: () => void;
  onUpdate: (id: string, payload: MealUpdatePayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onNotify: (message: string, severity?: 'success' | 'error') => void;
}

export default function HistoryTab({
  items,
  templates,
  isLoading,
  hasMore,
  isLoadingMore,
  authToken,
  authFetch,
  onLoadMore,
  onUpdate,
  onDelete,
  onNotify,
}: HistoryTabProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Edit dialog states
  const [editingItem, setEditingItem] = useState<MealRecord | null>(null);
  const [editImageKey, setEditImageKey] = useState<string | null>(null);
  const [editImageBlob, setEditImageBlob] = useState<Blob | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
  const [editDishes, setEditDishes] = useState<Dish[]>([]);
  const [editComment, setEditComment] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editTime, setEditTime] = useState<string>('');
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Delete confirmation inside edit flow
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const getImageUrl = (imageKey: string) => {
    const tokenQuery = authToken
      ? `?token=${encodeURIComponent(authToken)}`
      : '';
    return `/api/images/${encodeURIComponent(imageKey)}${tokenQuery}`;
  };

  const openEditDialog = (item: MealRecord) => {
    if (editPreviewUrl) {
      URL.revokeObjectURL(editPreviewUrl);
    }
    const hasDishes = Boolean(item.dishes && item.dishes.length > 0);
    const showTitle =
      Boolean(item.name) &&
      item.name !== '食事' &&
      item.name !== item.comment &&
      !hasDishes;

    setEditingItem(item);
    setEditImageKey(item.image_key || null);
    setEditImageBlob(null);
    setEditPreviewUrl(null);
    setEditDishes(item.dishes ? item.dishes.map((d) => ({ ...d })) : []);
    setEditComment(item.comment ?? (showTitle ? item.name : ''));
    setEditDate(item.logged_date);
    setEditTime(item.logged_time);
    setDeleteConfirmOpen(false);
  };

  const closeEditDialog = () => {
    if (isSaving || isDeleting) return;
    if (editPreviewUrl) {
      URL.revokeObjectURL(editPreviewUrl);
    }
    setEditingItem(null);
    setEditImageKey(null);
    setEditImageBlob(null);
    setEditPreviewUrl(null);
    setEditDishes([]);
    setEditComment('');
    setEditDate('');
    setEditTime('');
    setDeleteConfirmOpen(false);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsProcessingImage(true);
    try {
      const resized = await resizeImageTo1280x960(file);
      if (editPreviewUrl) {
        URL.revokeObjectURL(editPreviewUrl);
      }
      setEditImageBlob(resized);
      setEditPreviewUrl(URL.createObjectURL(resized));
      setEditImageKey(null);
    } catch {
      onNotify('画像の処理に失敗しました', 'error');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleClearEditImage = () => {
    if (editPreviewUrl) {
      URL.revokeObjectURL(editPreviewUrl);
    }
    setEditImageBlob(null);
    setEditPreviewUrl(null);
    setEditImageKey(null);
  };

  const handleRemoveDish = (index: number) => {
    setEditDishes((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddTemplateDishes = (tmpl: MealTemplate) => {
    const newDishes: Dish[] = tmpl.dishes.map((d) => ({
      id: crypto.randomUUID(),
      name: d.name,
      calories: Number(d.calories) || 0,
      protein: Number(d.protein) || 0,
      carbs: Number(d.carbs) || 0,
      fat: Number(d.fat) || 0,
    }));
    setEditDishes((prev) => [...prev, ...newDishes]);
  };

  const canSaveEdit =
    Boolean(editingItem) &&
    Boolean(editDate) &&
    Boolean(editTime) &&
    (Boolean(editImageBlob) ||
      Boolean(editImageKey) ||
      editDishes.length > 0 ||
      editComment.trim().length > 0);

  const handleSaveEdit = async () => {
    if (!editingItem || !canSaveEdit || isSaving || isProcessingImage) return;
    setIsSaving(true);

    try {
      let finalImageKey: string | null = editImageKey;

      if (editImageBlob) {
        const formData = new FormData();
        formData.append('file', editImageBlob, 'meal.jpg');

        const uploadRes = await authFetch('/api/images', {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error || '画像の保存に失敗しました');
        }

        const uploadData = await uploadRes.json();
        finalImageKey = uploadData.image_key || null;
      }

      let totalCalories = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;

      editDishes.forEach((d) => {
        totalCalories += Number(d.calories) || 0;
        totalProtein += Number(d.protein) || 0;
        totalCarbs += Number(d.carbs) || 0;
        totalFat += Number(d.fat) || 0;
      });

      const trimmedComment = editComment.trim();
      const dishSummary = editDishes.map((d) => d.name).join('・');
      const mealName = dishSummary || trimmedComment || '食事';

      await onUpdate(editingItem.id, {
        name: mealName,
        calories: Math.round(totalCalories * 10) / 10,
        protein: Math.round(totalProtein * 10) / 10,
        carbs: Math.round(totalCarbs * 10) / 10,
        fat: Math.round(totalFat * 10) / 10,
        image_key: finalImageKey,
        logged_date: editDate,
        logged_time: editTime,
        meal_type: editingItem.meal_type || 'meal',
        dishes: editDishes.length > 0 ? editDishes : null,
        comment: trimmedComment || null,
      });

      if (editPreviewUrl) {
        URL.revokeObjectURL(editPreviewUrl);
      }
      setEditingItem(null);
      setEditImageKey(null);
      setEditImageBlob(null);
      setEditPreviewUrl(null);
      setEditDishes([]);
      setEditComment('');
      setEditDate('');
      setEditTime('');
    } catch (err: any) {
      onNotify(err.message || '更新中にエラーが発生しました', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!editingItem || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(editingItem.id);
      setDeleteConfirmOpen(false);
      if (editPreviewUrl) {
        URL.revokeObjectURL(editPreviewUrl);
      }
      setEditingItem(null);
      setEditImageKey(null);
      setEditImageBlob(null);
      setEditPreviewUrl(null);
      setEditDishes([]);
      setEditComment('');
      setEditDate('');
      setEditTime('');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading && items.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Card variant="outlined" sx={{ borderRadius: 3, textAlign: 'center', py: 6 }}>
        <CardContent>
          <RestaurantIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" color="text.secondary">
            まだ記録がありません
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
            「記録」タブから写真やコメントを保存しましょう
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const activeEditImageUrl =
    editPreviewUrl || (editImageKey ? getImageUrl(editImageKey) : null);

  return (
    <Box>
      {/* Vertical Timeline */}
      <Box
        sx={{
          position: 'relative',
          pl: 3,
          '&::before': {
            content: '""',
            position: 'absolute',
            left: '9px',
            top: '8px',
            bottom: '8px',
            width: '2px',
            bgcolor: 'divider',
          },
        }}
      >
        <Stack spacing={2.5}>
          {items.map((item) => {
            const imageUrl = item.image_key ? getImageUrl(item.image_key) : null;
            const dishNames =
              item.dishes && item.dishes.length > 0
                ? item.dishes.map((d) => d.name)
                : [];
            const showTitle =
              item.name &&
              item.name !== '食事' &&
              item.name !== item.comment &&
              dishNames.length === 0;

            return (
              <Box key={item.id} sx={{ position: 'relative' }}>
                {/* Timeline Dot */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: '-21px',
                    top: '14px',
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    border: '2px solid',
                    borderColor: 'background.default',
                  }}
                />

                <Card variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
                  {/* Header Row: DateTime + Edit */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 2,
                      py: 1.25,
                      borderBottom: imageUrl ? '1px solid' : 'none',
                      borderColor: 'divider',
                    }}
                  >
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                      <AccessTimeIcon
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {formatTimelineDateTime(
                          item.logged_date,
                          item.logged_time
                        )}
                      </Typography>
                    </Stack>

                    <IconButton
                      size="small"
                      aria-label="編集"
                      onClick={() => openEditDialog(item)}
                      sx={{ color: 'text.secondary' }}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  {/* Photo (4:3 matching 1280x960) */}
                  {imageUrl && (
                    <CardMedia
                      component="img"
                      image={imageUrl}
                      alt={item.comment || item.name || '食事写真'}
                      onClick={() => setLightboxUrl(imageUrl)}
                      sx={{
                        width: '100%',
                        aspectRatio: '4 / 3',
                        objectFit: 'cover',
                        cursor: 'pointer',
                        bgcolor: '#0f172a',
                      }}
                    />
                  )}

                  {/* Template Chips & Comment (No Calories / No PFC) */}
                  {(dishNames.length > 0 || showTitle || item.comment) && (
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Stack spacing={1}>
                        {dishNames.length > 0 && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                            {dishNames.map((dishName, idx) => (
                              <Chip
                                key={`${item.id}-dish-${idx}`}
                                label={dishName}
                                size="small"
                                variant="outlined"
                              />
                            ))}
                          </Box>
                        )}
                        {showTitle && (
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {item.name}
                          </Typography>
                        )}
                        {item.comment && (
                          <Typography
                            variant="body2"
                            color="text.primary"
                            sx={{ whiteSpace: 'pre-wrap' }}
                          >
                            {item.comment}
                          </Typography>
                        )}
                      </Stack>
                    </CardContent>
                  )}
                </Card>
              </Box>
            );
          })}
        </Stack>
      </Box>

      {hasMore && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Button
            variant="outlined"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            sx={{ borderRadius: 2 }}
          >
            {isLoadingMore ? '読み込み中...' : 'もっと見る'}
          </Button>
        </Box>
      )}

      {/* Fullscreen Image Lightbox */}
      <Dialog
        open={Boolean(lightboxUrl)}
        onClose={() => setLightboxUrl(null)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: { bgcolor: '#000', position: 'relative', m: 1 },
          },
        }}
      >
        <IconButton
          onClick={() => setLightboxUrl(null)}
          aria-label="閉じる"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            color: '#fff',
            bgcolor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1,
          }}
        >
          <CloseIcon />
        </IconButton>
        {lightboxUrl && (
          <Box
            component="img"
            src={lightboxUrl}
            alt="拡大写真"
            sx={{
              width: '100%',
              height: 'auto',
              display: 'block',
            }}
          />
        )}
      </Dialog>

      {/* Edit Record Dialog */}
      <Dialog
        open={Boolean(editingItem)}
        onClose={closeEditDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>記録を編集</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 0.5 }}>
            {/* Photo */}
            <Box>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                写真
              </Typography>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={handleFileSelected}
              />
              <input
                ref={libraryInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleFileSelected}
              />

              {isProcessingImage ? (
                <Box
                  sx={{
                    aspectRatio: '4 / 3',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'action.hover',
                    borderRadius: 2,
                    gap: 1,
                  }}
                >
                  <CircularProgress size={32} />
                  <Typography variant="body2" color="text.secondary">
                    画像を最適化中...
                  </Typography>
                </Box>
              ) : activeEditImageUrl ? (
                <Box
                  sx={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '4 / 3',
                    borderRadius: 2,
                    overflow: 'hidden',
                    bgcolor: '#000',
                  }}
                >
                  <Box
                    component="img"
                    src={activeEditImageUrl}
                    alt="プレビュー"
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                  <IconButton
                    onClick={handleClearEditImage}
                    size="small"
                    aria-label="写真を削除"
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      bgcolor: 'rgba(0, 0, 0, 0.6)',
                      color: '#fff',
                      '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.8)' },
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              ) : (
                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="contained"
                    fullWidth
                    startIcon={<PhotoCameraIcon />}
                    onClick={() => cameraInputRef.current?.click()}
                    sx={{ py: 1.5, borderRadius: 2 }}
                  >
                    写真を撮る
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    startIcon={<PhotoLibraryIcon />}
                    onClick={() => libraryInputRef.current?.click()}
                    sx={{ py: 1.5, borderRadius: 2 }}
                  >
                    アルバム
                  </Button>
                </Stack>
              )}
            </Box>

            {/* Dishes & Templates */}
            {(editDishes.length > 0 || templates.length > 0) && (
              <Box>
                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                  項目・テンプレート
                </Typography>

                {editDishes.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: templates.length > 0 ? 1.5 : 0 }}>
                    {editDishes.map((dish, idx) => (
                      <Chip
                        key={`edit-dish-${dish.id || idx}-${idx}`}
                        label={dish.name}
                        color="primary"
                        onDelete={() => handleRemoveDish(idx)}
                      />
                    ))}
                  </Box>
                )}

                {templates.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                      タップして追加
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                      {templates.map((tmpl) => (
                        <Chip
                          key={`edit-tmpl-${tmpl.id}`}
                          label={`+ ${tmpl.name}`}
                          size="small"
                          variant="outlined"
                          onClick={() => handleAddTemplateDishes(tmpl)}
                        />
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            {/* Comment */}
            <TextField
              label="コメント"
              placeholder="メモや食べたものを入力"
              multiline
              minRows={2}
              fullWidth
              value={editComment}
              onChange={(e) => setEditComment(e.target.value)}
            />

            {/* Date & Time */}
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="日付"
                type="date"
                fullWidth
                size="small"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="時刻"
                type="time"
                fullWidth
                size="small"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 2 }}>
          <Button
            color="error"
            startIcon={<DeleteOutlinedIcon />}
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={isSaving || isDeleting}
          >
            削除
          </Button>
          <Stack direction="row" spacing={1}>
            <Button onClick={closeEditDialog} disabled={isSaving || isDeleting}>
              キャンセル
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveEdit}
              disabled={!canSaveEdit || isSaving || isProcessingImage || isDeleting}
            >
              {isSaving ? '保存中...' : '保存'}
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog (triggered from Edit Dialog) */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => !isDeleting && setDeleteConfirmOpen(false)}
      >
        <DialogTitle>記録を削除</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            この記録（写真とコメント）を削除しますか？この操作は元に戻せません。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteConfirmOpen(false)}
            disabled={isDeleting}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
          >
            {isDeleting ? '削除中...' : '削除'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
