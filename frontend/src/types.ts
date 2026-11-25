export interface Dish {
  id?: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealRecord {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  image_key?: string | null;
  logged_date: string; // YYYY-MM-DD
  logged_time: string; // HH:MM
  logged_at: string;
  meal_type: string;
  dishes?: Dish[] | null;
  comment?: string | null;
}

export interface MealTemplate {
  id: string;
  name: string;
  dishes: Dish[];
}
