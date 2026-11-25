import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  AUTH_TOKEN?: string;     // Stored as worker secret for access control
};

const app = new Hono<{ Bindings: Bindings }>();

// Prevent search engines (Google, etc.) from indexing any route, API, or static asset
app.use('*', async (c, next) => {
  await next();
  const res = new Response(c.res.body, c.res);
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  c.res = res;
});

// Restrict access to Japan (JP) IPs only in production (Cloudflare Workers)
app.use('*', async (c, next) => {
  const country = c.req.header('cf-ipcountry') || (c.req.raw as { cf?: { country?: string } }).cf?.country;
  // In local dev (wrangler dev), cf-ipcountry is typically undefined; allow it locally
  if (country && country !== 'JP') {
    return c.text('Access denied: This site is only available from Japan.', 403);
  }
  await next();
});

// Enable CORS so the React frontend can talk to the Worker API
app.use('/api/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Enforce Access Control/Authentication if AUTH_TOKEN is set in the environment
// Disabled: access code authentication removed
app.use('/api/*', async (c, next) => {
  await next();
});

let commentColumnChecked = false;

/**
 * Ensures the `comment` column exists on `meals` for databases created before it was added.
 */
async function ensureMealsCommentColumn(db: D1Database): Promise<void> {
  if (commentColumnChecked) return;
  try {
    const info = await db.prepare('PRAGMA table_info(meals)').all();
    const hasComment = info.results?.some((col: any) => col.name === 'comment');
    if (!hasComment) {
      await db.prepare('ALTER TABLE meals ADD COLUMN comment TEXT').run();
    }
    commentColumnChecked = true;
  } catch (err) {
    console.error('Failed to ensure comment column on meals:', err);
  }
}

// Lightweight auth check endpoint
app.get('/api/auth/check', (c) => {
  return c.json({ ok: true });
});

// ----------------------------------------------------
// 1. User Profile Endpoints
// ----------------------------------------------------
app.get('/api/profile', async (c) => {
  try {
    const profile = await c.env.DB.prepare(
      'SELECT * FROM user_profile WHERE id = ?'
    ).bind('default').first();

    if (!profile) {
      // Fallback if not seeded yet
      return c.json({
        id: 'default',
        target_calories: 3000,
        target_protein: 150,
        target_carbs: 350,
        target_fat: 80,
        current_weight: 65.0,
        target_weight: 75.0,
      });
    }
    return c.json(profile);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/api/profile', async (c) => {
  try {
    const body = await c.req.json();
    const { target_calories, target_protein, target_carbs, target_fat, current_weight, target_weight } = body;

    await c.env.DB.prepare(`
      INSERT INTO user_profile (id, target_calories, target_protein, target_carbs, target_fat, current_weight, target_weight)
      VALUES ('default', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        target_calories = excluded.target_calories,
        target_protein = excluded.target_protein,
        target_carbs = excluded.target_carbs,
        target_fat = excluded.target_fat,
        current_weight = excluded.current_weight,
        target_weight = excluded.target_weight
    `).bind(
      target_calories,
      target_protein,
      target_carbs,
      target_fat,
      current_weight,
      target_weight
    ).run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ----------------------------------------------------
// 2. Meal Endpoints
// ----------------------------------------------------
app.get('/api/meals', async (c) => {
  try {
    const date = c.req.query('date'); // Expecting YYYY-MM-DD
    if (!date) {
      return c.json({ error: 'Missing date parameter' }, 400);
    }

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM meals WHERE logged_date = ? ORDER BY logged_time ASC'
    ).bind(date).all();

    // Parse dishes column from JSON string to array of objects
    const formattedResults = results.map((row: any) => {
      let dishes = null;
      if (row.dishes) {
        try {
          dishes = JSON.parse(row.dishes);
        } catch (e) {
          console.error('Failed to parse dishes JSON:', e);
        }
      }
      return { ...row, dishes };
    });

    return c.json(formattedResults);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/api/meals/history', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT DISTINCT name, calories, protein, carbs, fat, dishes, image_key, meal_type
      FROM meals
      ORDER BY logged_at DESC
      LIMIT 20
    `).all();

    // Parse dishes column from JSON string to array of objects
    const formattedResults = results.map((row: any) => {
      let dishes = null;
      if (row.dishes) {
        try {
          dishes = JSON.parse(row.dishes);
        } catch (e) {
          console.error('Failed to parse dishes JSON:', e);
        }
      }
      return { ...row, dishes };
    });

    return c.json(formattedResults);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Chronological timeline endpoint for History tab
app.get('/api/meals/timeline', async (c) => {
  try {
    await ensureMealsCommentColumn(c.env.DB);
    const limit = Math.min(Math.max(Number(c.req.query('limit') || 30), 1), 100);
    const offset = Math.max(Number(c.req.query('offset') || 0), 0);

    const { results } = await c.env.DB.prepare(`
      SELECT id, name, calories, protein, carbs, fat, image_key, logged_date, logged_time, logged_at, meal_type, dishes, comment
      FROM meals
      ORDER BY logged_date DESC, logged_time DESC, logged_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit + 1, offset).all();

    const hasMore = results.length > limit;
    const sliced = hasMore ? results.slice(0, limit) : results;

    const items = sliced.map((row: any) => {
      let dishes = null;
      if (row.dishes) {
        try {
          dishes = JSON.parse(row.dishes);
        } catch (e) {
          console.error('Failed to parse dishes JSON:', e);
        }
      }
      return { ...row, dishes };
    });

    return c.json({ items, has_more: hasMore });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/api/meals', async (c) => {
  try {
    await ensureMealsCommentColumn(c.env.DB);
    const body = await c.req.json();
    const {
      name,
      calories = 0,
      protein = 0,
      carbs = 0,
      fat = 0,
      image_key,
      logged_date,
      logged_time,
      meal_type = 'meal',
      dishes,
      comment,
    } = body;

    if (!logged_date || !logged_time) {
      return c.json({ error: 'Missing required date or time fields' }, 400);
    }

    const mealName = (name && String(name).trim()) || (comment && String(comment).trim()) || '食事';
    const id = crypto.randomUUID();
    const logged_at = new Date().toISOString();

    await c.env.DB.prepare(`
      INSERT INTO meals (id, name, calories, protein, carbs, fat, image_key, logged_date, logged_time, logged_at, meal_type, dishes, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      mealName,
      Number(calories) || 0,
      Number(protein) || 0,
      Number(carbs) || 0,
      Number(fat) || 0,
      image_key || null,
      logged_date,
      logged_time,
      logged_at,
      meal_type || 'meal',
      dishes ? JSON.stringify(dishes) : null,
      comment ? String(comment) : null
    ).run();

    return c.json({
      success: true,
      meal: {
        id,
        name: mealName,
        calories: Number(calories) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fat: Number(fat) || 0,
        image_key: image_key || null,
        logged_date,
        logged_time,
        logged_at,
        meal_type: meal_type || 'meal',
        dishes: dishes || null,
        comment: comment ? String(comment) : null,
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.delete('/api/meals/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    // Find the meal first to check if there is an image in R2 to delete
    const meal: any = await c.env.DB.prepare(
      'SELECT image_key FROM meals WHERE id = ?'
    ).bind(id).first();

    if (!meal) {
      return c.json({ error: 'Meal not found' }, 404);
    }

    // Delete meal from DB
    await c.env.DB.prepare('DELETE FROM meals WHERE id = ?').bind(id).run();

    // Delete image from R2 if it exists
    if (meal.image_key) {
      await c.env.BUCKET.delete(meal.image_key);
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.put('/api/meals/:id', async (c) => {
  try {
    await ensureMealsCommentColumn(c.env.DB);
    const id = c.req.param('id');
    const body = await c.req.json();
    const {
      name,
      calories = 0,
      protein = 0,
      carbs = 0,
      fat = 0,
      image_key,
      logged_date,
      logged_time,
      meal_type = 'meal',
      dishes,
      comment,
    } = body;

    if (!logged_date || !logged_time) {
      return c.json({ error: 'Missing required date or time fields' }, 400);
    }

    const mealName = (name && String(name).trim()) || (comment && String(comment).trim()) || '食事';

    // Check if the meal exists
    const meal: any = await c.env.DB.prepare(
      'SELECT id, image_key FROM meals WHERE id = ?'
    ).bind(id).first();

    if (!meal) {
      return c.json({ error: 'Meal not found' }, 404);
    }

    // Update the meal in the DB
    await c.env.DB.prepare(`
      UPDATE meals 
      SET name = ?, calories = ?, protein = ?, carbs = ?, fat = ?, image_key = ?, logged_date = ?, logged_time = ?, meal_type = ?, dishes = ?, comment = ?
      WHERE id = ?
    `).bind(
      mealName,
      Number(calories) || 0,
      Number(protein) || 0,
      Number(carbs) || 0,
      Number(fat) || 0,
      image_key || null,
      logged_date,
      logged_time,
      meal_type || 'meal',
      dishes ? JSON.stringify(dishes) : null,
      comment ? String(comment) : null,
      id
    ).run();

    // Delete the old image from R2 if image_key changed
    if (meal.image_key && meal.image_key !== image_key) {
      try {
        await c.env.BUCKET.delete(meal.image_key);
      } catch (e) {
        console.error('Failed to delete old image from R2:', e);
      }
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ----------------------------------------------------
// 2b. Meal Templates Endpoints
// ----------------------------------------------------
app.get('/api/templates', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM meal_templates ORDER BY name ASC'
    ).all();

    const formattedResults = results.map((row: any) => {
      let dishes = [];
      try {
        dishes = JSON.parse(row.dishes);
      } catch (e) {
        console.error('Failed to parse template dishes JSON:', e);
      }
      return { ...row, dishes };
    });

    return c.json(formattedResults);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/api/templates', async (c) => {
  try {
    const body = await c.req.json();
    const { id, name, dishes } = body;

    if (!name || !dishes || !Array.isArray(dishes)) {
      return c.json({ error: 'Missing name or dishes array' }, 400);
    }

    const templateId = id || crypto.randomUUID();
    const dishesStr = JSON.stringify(dishes);

    await c.env.DB.prepare(`
      INSERT INTO meal_templates (id, name, dishes)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        dishes = excluded.dishes
    `).bind(templateId, name, dishesStr).run();

    return c.json({ success: true, template: { id: templateId, name, dishes } });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.delete('/api/templates/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM meal_templates WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ----------------------------------------------------
// 3. Weight Log Endpoints
// ----------------------------------------------------
app.get('/api/weight', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM weight_logs ORDER BY logged_date ASC'
    ).all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/api/weight', async (c) => {
  try {
    const body = await c.req.json();
    const { weight, logged_date } = body;

    if (weight === undefined || !logged_date) {
      return c.json({ error: 'Missing weight or logged_date' }, 400);
    }

    const id = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO weight_logs (id, weight, logged_date)
      VALUES (?, ?, ?)
      ON CONFLICT(logged_date) DO UPDATE SET weight = excluded.weight
    `).bind(id, Number(weight), logged_date).run();

    // Also update current weight in user profile
    await c.env.DB.prepare(`
      UPDATE user_profile SET current_weight = ? WHERE id = 'default'
    `).bind(Number(weight)).run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ----------------------------------------------------
// 4. Monthly History (Aggregated for Calendar View)
// ----------------------------------------------------
app.get('/api/history', async (c) => {
  try {
    const month = c.req.query('month'); // Expecting YYYY-MM
    if (!month) {
      return c.json({ error: 'Missing month parameter' }, 400);
    }

    // Query daily detail of meals for the given month
    const mealsQuery = await c.env.DB.prepare(`
      SELECT 
        logged_date,
        calories,
        protein,
        carbs,
        fat,
        dishes
      FROM meals
      WHERE logged_date LIKE ?
    `).bind(`${month}%`).all();

    // Query weight logs for the month
    const weightsQuery = await c.env.DB.prepare(`
      SELECT logged_date, weight
      FROM weight_logs
      WHERE logged_date LIKE ?
    `).bind(`${month}%`).all();

    // Combine them into a dictionary by date
    const historyMap: Record<string, any> = {};

    mealsQuery.results.forEach((row: any) => {
      const date = row.logged_date;
      if (!historyMap[date]) {
        historyMap[date] = {
          total_calories: 0,
          total_protein: 0,
          total_carbs: 0,
          total_fat: 0,
          meal_count: 0,
          weight: null,
          has_uncalculated: false
        };
      }

      historyMap[date].total_calories += row.calories;
      historyMap[date].total_protein += row.protein;
      historyMap[date].total_carbs += row.carbs;
      historyMap[date].total_fat += row.fat;
      historyMap[date].meal_count += 1;

      // Check if the meal or any of its dishes has uncalculated nutrients
      let isMealUncalculated = row.calories === 0 || (row.protein === 0 && row.carbs === 0 && row.fat === 0);
      if (!isMealUncalculated && row.dishes) {
        try {
          const dishesList = JSON.parse(row.dishes);
          if (Array.isArray(dishesList)) {
            isMealUncalculated = dishesList.some((d: any) => d.calories === 0 || (d.protein === 0 && d.carbs === 0 && d.fat === 0));
          }
        } catch (e) {
          console.error('Failed to parse dishes JSON:', e);
        }
      }

      if (isMealUncalculated) {
        historyMap[date].has_uncalculated = true;
      }
    });

    weightsQuery.results.forEach((row: any) => {
      if (historyMap[row.logged_date]) {
        historyMap[row.logged_date].weight = row.weight;
      } else {
        historyMap[row.logged_date] = {
          total_calories: 0,
          total_protein: 0,
          total_carbs: 0,
          total_fat: 0,
          meal_count: 0,
          weight: row.weight,
          has_uncalculated: false
        };
      }
    });

    return c.json(historyMap);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ----------------------------------------------------
// 5. Image Storage Endpoints (No AI)
// ----------------------------------------------------

// Upload image to R2 only
app.post('/api/images', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No image file uploaded' }, 400);
    }

    const fileExtension = file.name.split('.').pop() || 'jpg';
    const imageKey = `images/${crypto.randomUUID()}.${fileExtension}`;

    const arrayBuffer = await file.arrayBuffer();
    await c.env.BUCKET.put(imageKey, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'image/jpeg' },
    });

    return c.json({
      success: true,
      image_key: imageKey,
    });
  } catch (err: any) {
    console.error('Error in image upload endpoint:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Retrieve image from R2
app.get('/api/images/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const decodedKey = decodeURIComponent(key);
    const object = await c.env.BUCKET.get(decodedKey);

    if (!object) {
      return c.json({ error: 'Image not found' }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year since images are immutable

    return new Response(object.body, { headers });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});


// Fallback to static assets (SPA) for non-API routes
app.all('*', (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
