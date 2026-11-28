import { Dish, MealTemplate } from '../types';
import { getTodayDateString } from './image';

export interface ParsedDishItem {
  dish: Dish;
  matchedTemplateName: string | null;
  quantity: number;
}

export interface ParsedNaturalLanguageMeal {
  rawText: string;
  items: ParsedDishItem[];
  loggedDate: string | null;
  loggedTime: string | null;
  mealName: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

function toHalfWidth(str: string): string {
  return str
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ':')
    .replace(/．/g, '.');
}

function formatDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Extracts optional date and time expressions from Japanese natural language text
 * and returns the remaining food description text.
 */
function extractDateTime(text: string): {
  remainingText: string;
  loggedDate: string | null;
  loggedTime: string | null;
} {
  let work = toHalfWidth(text).trim();
  let loggedDate: string | null = null;
  let loggedTime: string | null = null;

  // 1. Date expressions
  const relativeDateMatch = work.match(/(一昨日|おととい|昨日|今日)(?:の)?/);
  if (relativeDateMatch) {
    const word = relativeDateMatch[1];
    if (word === '今日') {
      loggedDate = getTodayDateString();
    } else if (word === '昨日') {
      loggedDate = formatDateOffset(-1);
    } else {
      loggedDate = formatDateOffset(-2);
    }
    work = work.replace(relativeDateMatch[0], ' ');
  } else {
    const mdMatch = work.match(
      /(?:^|[\s、,])(\d{1,2})[月/](\d{1,2})日?(?:の|に)?(?=[\s、,]|$|[一-龠ァ-ヴーa-zA-Z0-9])/
    );
    if (mdMatch) {
      const m = Number(mdMatch[1]);
      const d = Number(mdMatch[2]);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        const year = new Date().getFullYear();
        loggedDate = `${year}-${pad2(m)}-${pad2(d)}`;
        work = work.replace(mdMatch[0], ' ');
      }
    }
  }

  // 2. Explicit time expressions: HH:MM or H時M分 / H時半
  const colonTimeMatch = work.match(/(?:^|[\s、,])(\d{1,2}):(\d{2})(?:に|の|、|\s|$)/);
  if (colonTimeMatch) {
    const h = Number(colonTimeMatch[1]);
    const m = Number(colonTimeMatch[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      loggedTime = `${pad2(h)}:${pad2(m)}`;
      work = work.replace(colonTimeMatch[0], ' ');
    }
  } else {
    const jpTimeMatch = work.match(
      /(午前|午後|朝|昼|夕方|夜)?\s*(\d{1,2})時(?:(\d{1,2})分|(半))?(?:ごろ|頃)?(?:に|の)?/
    );
    if (jpTimeMatch) {
      const period = jpTimeMatch[1] || '';
      let h = Number(jpTimeMatch[2]);
      const m = jpTimeMatch[4] ? 30 : jpTimeMatch[3] ? Number(jpTimeMatch[3]) : 0;

      if ((period === '午後' || period === '夕方' || period === '夜') && h < 12) {
        h += 12;
      } else if (period === '午前' && h === 12) {
        h = 0;
      }

      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        loggedTime = `${pad2(h)}:${pad2(m)}`;
        work = work.replace(jpTimeMatch[0], ' ');
      }
    } else {
      // Period-only expression (avoid matching words like 朝ごはん / 夜食)
      const periodOnlyMatch = work.match(
        /(?:^|\s)(今朝|朝|昼|夕方|夜)(?!ごはん|ご飯|飯|食)(?:に|の|は)?(?:\s|$)/
      );
      if (periodOnlyMatch) {
        const p = periodOnlyMatch[1];
        if (p === '今朝' || p === '朝') loggedTime = '08:00';
        else if (p === '昼') loggedTime = '12:00';
        else if (p === '夕方') loggedTime = '17:00';
        else if (p === '夜') loggedTime = '20:00';
        work = work.replace(periodOnlyMatch[0], ' ');
      }
    }
  }

  // Clean up leading particles left over after date/time removal
  work = work.replace(/^[\s、,にの]+/, '').trim();

  return { remainingText: work, loggedDate, loggedTime };
}

function parseQuantity(chunk: string): { cleanName: string; quantity: number } {
  const normalized = toHalfWidth(chunk).trim();
  return { cleanName: normalized, quantity: 1 };
}

function splitMealChunks(text: string): string[] {
  // Remove trailing Japanese verbs/endings like "を食べた", "を飲んだ", "追加"
  let cleaned = text
    .replace(
      /(?:を)?(?:食べました|食べた|飲みました|飲んだ|摂りました|摂った|とりました|とった|記録する|記録|追加する|追加|保存する|保存|しました|した|です|ます|ました)[。！!.]*$/g,
      ''
    )
    .replace(/[。！!.]+$/g, '')
    .trim();

  if (!cleaned) return [];

  // Split by explicit delimiters first
  const primaryParts = cleaned
    .split(/[、,\n・+＋&＆\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Split safe "と" / "や" conjunctions between Kanji/Katakana/ASCII/units
  const finalParts: string[] = [];
  for (const part of primaryParts) {
    const subParts = part
      .split(/(?<=[一-龠ァ-ヴー0-9a-zA-Z個本杯枚皿食袋倍gG])[とや](?=[一-龠ァ-ヴー0-9a-zA-Z])/)
      .map((s) => s.trim())
      .filter(Boolean);
    finalParts.push(...subParts);
  }

  return finalParts;
}

function roundNutrient(val: number): number {
  return Math.round(val * 10) / 10;
}

/**
 * Parses a natural language meal description into structured dishes,
 * matching registered templates and extracting quantities/date/time without AI.
 */
export function parseNaturalLanguageMeal(
  input: string,
  templates: MealTemplate[]
): ParsedNaturalLanguageMeal | null {
  const rawText = input.trim();
  if (!rawText) return null;

  const { remainingText, loggedDate, loggedTime } = extractDateTime(rawText);
  const chunks = splitMealChunks(remainingText);

  if (chunks.length === 0) {
    return null;
  }

  // Sort templates by name length descending so longer names match first
  const sortedTemplates = [...templates].sort(
    (a, b) => b.name.length - a.name.length
  );

  const items: ParsedDishItem[] = [];
  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;

  for (const chunk of chunks) {
    const { cleanName, quantity } = parseQuantity(chunk);
    const normalizedClean = cleanName.toLowerCase();

    const matchedTemplate = sortedTemplates.find((t) => {
      const tName = toHalfWidth(t.name).trim().toLowerCase();
      return (
        normalizedClean === tName ||
        normalizedClean.includes(tName) ||
        (normalizedClean.length >= 2 && tName.includes(normalizedClean))
      );
    });

    if (matchedTemplate && matchedTemplate.dishes.length > 0) {
      for (const d of matchedTemplate.dishes) {
        const calories = roundNutrient((Number(d.calories) || 0) * quantity);
        const protein = roundNutrient((Number(d.protein) || 0) * quantity);
        const carbs = roundNutrient((Number(d.carbs) || 0) * quantity);
        const fat = roundNutrient((Number(d.fat) || 0) * quantity);
        const displayName = quantity === 1 ? d.name : `${d.name} ×${quantity}`;

        items.push({
          dish: {
            id: crypto.randomUUID(),
            name: displayName,
            calories,
            protein,
            carbs,
            fat,
          },
          matchedTemplateName: matchedTemplate.name,
          quantity,
        });

        totalCalories += calories;
        totalProtein += protein;
        totalCarbs += carbs;
        totalFat += fat;
      }
    } else {
      // Unmatched free-form food item
      const displayName = quantity === 1 ? cleanName : `${cleanName} ×${quantity}`;
      items.push({
        dish: {
          id: crypto.randomUUID(),
          name: displayName,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
        matchedTemplateName: null,
        quantity,
      });
    }
  }

  const mealName = items.map((item) => item.dish.name).join('・') || rawText;

  return {
    rawText,
    items,
    loggedDate,
    loggedTime,
    mealName,
    totalCalories: roundNutrient(totalCalories),
    totalProtein: roundNutrient(totalProtein),
    totalCarbs: roundNutrient(totalCarbs),
    totalFat: roundNutrient(totalFat),
  };
}
