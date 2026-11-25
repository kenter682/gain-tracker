import React, { useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { Dish, MealTemplate } from '../types';
import {
  getCurrentTimeString,
  getTodayDateString,
  resizeImageTo1280x960,
} from '../utils/image';
import { parseNaturalLanguageMeal } from '../utils/naturalLanguage';

interface RecordTabProps {
  templates: MealTemplate[];
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  onSaved: () => void;
  onNotify: (message: string, severity?: 'success' | 'error') => void;
}

export default function RecordTab({
  templates,
  authFetch,
  onSaved,
  onNotify,
}: RecordTabProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [naturalText, setNaturalText] = useState<string>('');
  const [showNaturalInput, setShowNaturalInput] = useState<boolean>(false);
  const [comment, setComment] = useState<string>('');
  const [loggedDate, setLoggedDate] = useState<string>(getTodayDateString());
  const [loggedTime, setLoggedTime] = useState<string>(getCurrentTimeString());
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const parsedMeal = useMemo(
    () => parseNaturalLanguageMeal(naturalText, templates),
    [naturalText, templates]
  );

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsProcessingImage(true);
    try {
      const resized = await resizeImageTo1280x960(file);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setImageBlob(resized);
      setPreviewUrl(URL.createObjectURL(resized));
    } catch {
      onNotify('画像の処理に失敗しました', 'error');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleClearImage = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setImageBlob(null);
    setPreviewUrl(null);
  };

  const toggleTemplate = (id: string) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const canSave =
    Boolean(imageBlob) ||
    selectedTemplateIds.length > 0 ||
    naturalText.trim().length > 0 ||
    comment.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);

    try {
      let imageKey: string | null = null;

      if (imageBlob) {
        const formData = new FormData();
        formData.append('file', imageBlob, 'meal.jpg');

        const uploadRes = await authFetch('/api/images', {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error || '画像の保存に失敗しました');
        }

        const uploadData = await uploadRes.json();
        imageKey = uploadData.image_key || null;
      }

      const chosenTemplates = templates.filter((t) =>
        selectedTemplateIds.includes(t.id)
      );

      const allDishes: Dish[] = [];
      let totalCalories = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;

      chosenTemplates.forEach((tmpl) => {
        tmpl.dishes.forEach((d) => {
          allDishes.push({
            id: crypto.randomUUID(),
            name: d.name,
            calories: Number(d.calories) || 0,
            protein: Number(d.protein) || 0,
            carbs: Number(d.carbs) || 0,
            fat: Number(d.fat) || 0,
          });
          totalCalories += Number(d.calories) || 0;
          totalProtein += Number(d.protein) || 0;
          totalCarbs += Number(d.carbs) || 0;
          totalFat += Number(d.fat) || 0;
        });
      });

      if (parsedMeal) {
        parsedMeal.items.forEach((item) => {
          allDishes.push({
            ...item.dish,
            id: crypto.randomUUID(),
          });
        });
        totalCalories += parsedMeal.totalCalories;
        totalProtein += parsedMeal.totalProtein;
        totalCarbs += parsedMeal.totalCarbs;
        totalFat += parsedMeal.totalFat;
      }

      const trimmedNatural = naturalText.trim();
      const trimmedComment = comment.trim();
      const dishSummary = allDishes.map((d) => d.name).join('・');
      const mealName = dishSummary || trimmedNatural || trimmedComment || '食事';
      const finalDate = parsedMeal?.loggedDate || loggedDate;
      const finalTime = parsedMeal?.loggedTime || loggedTime;

      const saveRes = await authFetch('/api/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: mealName,
          calories: Math.round(totalCalories * 10) / 10,
          protein: Math.round(totalProtein * 10) / 10,
          carbs: Math.round(totalCarbs * 10) / 10,
          fat: Math.round(totalFat * 10) / 10,
          image_key: imageKey,
          logged_date: finalDate,
          logged_time: finalTime,
          meal_type: 'meal',
          dishes: allDishes.length > 0 ? allDishes : null,
          comment: trimmedComment || (allDishes.length === 0 && trimmedNatural ? trimmedNatural : null),
        }),
      });

      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        throw new Error(errData.error || '記録の保存に失敗しました');
      }

      handleClearImage();
      setSelectedTemplateIds([]);
      setNaturalText('');
      setShowNaturalInput(false);
      setComment('');
      setLoggedDate(getTodayDateString());
      setLoggedTime(getCurrentTimeString());
      onNotify('記録を保存しました', 'success');
      onSaved();
    } catch (err: any) {
      onNotify(err.message || '保存中にエラーが発生しました', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      {/* Photo Capture Card */}
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
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
          ) : previewUrl ? (
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
                src={previewUrl}
                alt="プレビュー"
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              <IconButton
                onClick={handleClearImage}
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
                size="large"
                fullWidth
                startIcon={<PhotoCameraIcon />}
                onClick={() => cameraInputRef.current?.click()}
                sx={{ py: 2, borderRadius: 2 }}
              >
                写真を撮る
              </Button>
              <Button
                variant="outlined"
                size="large"
                fullWidth
                startIcon={<PhotoLibraryIcon />}
                onClick={() => libraryInputRef.current?.click()}
                sx={{ py: 2, borderRadius: 2 }}
              >
                アルバム
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Templates Card */}
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
            テンプレート
          </Typography>
          {templates.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              設定タブからテンプレートを追加できます
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {templates.map((tmpl) => {
                const selected = selectedTemplateIds.includes(tmpl.id);
                return (
                  <Chip
                    key={tmpl.id}
                    label={tmpl.name}
                    icon={selected ? <CheckIcon /> : undefined}
                    color={selected ? 'primary' : 'default'}
                    variant={selected ? 'filled' : 'outlined'}
                    onClick={() => toggleTemplate(tmpl.id)}
                    sx={{ fontWeight: 500, py: 0.5 }}
                  />
                );
              })}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Comment & DateTime Card */}
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="コメント"
              placeholder="メモや食べたものを入力"
              multiline
              minRows={2}
              fullWidth
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            <Stack direction="row" spacing={1.5}>
              <TextField
                label="日付"
                type="date"
                fullWidth
                size="small"
                value={loggedDate}
                onChange={(e) => setLoggedDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="時刻"
                type="time"
                fullWidth
                size="small"
                value={loggedTime}
                onChange={(e) => setLoggedTime(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        disabled={!canSave || isSaving || isProcessingImage}
        startIcon={
          isSaving ? (
            <CircularProgress size={20} color="inherit" />
          ) : (
            <SaveIcon />
          )
        }
        onClick={handleSave}
        sx={{ py: 1.75, borderRadius: 2.5, fontWeight: 700, fontSize: '1rem' }}
      >
        {isSaving ? '保存中...' : '記録する'}
      </Button>

      {/* Subtle Collapsible Natural Language Input */}
      <Box sx={{ textAlign: 'center' }}>
        <Button
          size="small"
          color="inherit"
          onClick={() => setShowNaturalInput((prev) => !prev)}
          endIcon={showNaturalInput ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          sx={{ color: 'text.secondary', fontSize: '0.8rem', fontWeight: 500 }}
        >
          言葉で追加
        </Button>

        <Collapse in={showNaturalInput}>
          <Card variant="outlined" sx={{ mt: 1, borderRadius: 3, textAlign: 'left' }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="例: プロテインとおにぎり2個、昨日の夜にラーメン"
                  value={naturalText}
                  onChange={(e) => setNaturalText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (naturalText.trim() && !isSaving && !isProcessingImage) {
                        handleSave();
                      }
                    }
                  }}
                />
                <Button
                  variant="outlined"
                  disabled={!naturalText.trim() || isSaving || isProcessingImage}
                  onClick={handleSave}
                  sx={{ whiteSpace: 'nowrap', px: 2, borderRadius: 2, height: 40 }}
                >
                  {isSaving ? '保存中' : '記録'}
                </Button>
              </Stack>

              {parsedMeal && (parsedMeal.items.length > 0 || parsedMeal.loggedDate || parsedMeal.loggedTime) && (
                <Box sx={{ mt: 1.5 }}>
                  <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                    {(parsedMeal.loggedDate || parsedMeal.loggedTime) && (
                      <Chip
                        size="small"
                        icon={<ScheduleIcon />}
                        label={`${parsedMeal.loggedDate || loggedDate} ${parsedMeal.loggedTime || loggedTime}`}
                        color="secondary"
                        variant="outlined"
                      />
                    )}
                    {parsedMeal.items.map((item, idx) => (
                      <Chip
                        key={`nl-${idx}-${item.dish.name}`}
                        size="small"
                        label={item.dish.name}
                        icon={item.matchedTemplateName ? <CheckIcon /> : undefined}
                        color={item.matchedTemplateName ? 'primary' : 'default'}
                        variant={item.matchedTemplateName ? 'filled' : 'outlined'}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </CardContent>
          </Card>
        </Collapse>
      </Box>
    </Stack>
  );
}
