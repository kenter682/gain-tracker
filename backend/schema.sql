-- Create User Profile table
CREATE TABLE IF NOT EXISTS user_profile (
  id TEXT PRIMARY KEY,
  target_calories REAL NOT NULL,
  target_protein REAL NOT NULL,
  target_carbs REAL NOT NULL,
  target_fat REAL NOT NULL,
  current_weight REAL NOT NULL,
  target_weight REAL NOT NULL
);

-- Create Meals table
CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  calories REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL,
  image_key TEXT,
  logged_date TEXT NOT NULL, -- Format: YYYY-MM-DD
  logged_time TEXT NOT NULL, -- Format: HH:MM
  logged_at TEXT NOT NULL,   -- ISO Timestamp
  meal_type TEXT NOT NULL,   -- meal (no breakfast/lunch/dinner split)
  dishes TEXT,               -- JSON array of dishes [{name, calories, protein, carbs, fat}]
  comment TEXT               -- Optional user comment
);

-- Create Weight Logs table
CREATE TABLE IF NOT EXISTS weight_logs (
  id TEXT PRIMARY KEY,
  weight REAL NOT NULL,
  logged_date TEXT NOT NULL UNIQUE -- Format: YYYY-MM-DD
);

-- Seed default user profile if not exists
INSERT OR IGNORE INTO user_profile (id, target_calories, target_protein, target_carbs, target_fat, current_weight, target_weight)
VALUES ('default', 3000, 150, 350, 80, 65.0, 75.0);

-- Create Meal Templates table
CREATE TABLE IF NOT EXISTS meal_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dishes TEXT NOT NULL -- JSON array of dishes [{name, calories, protein, carbs, fat}]
);

-- Seed default templates
INSERT OR IGNORE INTO meal_templates (id, name, dishes) VALUES
('default-tmpl-1', 'プロテイン', '[{"name":"プロテイン","calories":120,"protein":22.5,"carbs":2.5,"fat":1.5}]'),
('default-tmpl-4', 'おにぎり', '[{"name":"おにぎり","calories":180,"protein":3.5,"carbs":40,"fat":0.5}]'),
('default-tmpl-2', 'マルトデキストリン', '[{"name":"マルトデキストリン","calories":80,"protein":0,"carbs":20,"fat":0}]'),
('default-tmpl-3', 'ごはん100g', '[{"name":"ごはん100g","calories":156,"protein":2.5,"carbs":37,"fat":0.3}]');

