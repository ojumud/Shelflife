import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePort(): number {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } else if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  const envPort = Number(process.env.PORT);
  return Number.isFinite(envPort) && envPort > 0 ? envPort : 3000;
}

const PORT = resolvePort();

async function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  const { GoogleGenAI, Type } = await import('@google/genai');
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return { ai, Type };
}

function formatGeminiError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const msg = error.message || '';
  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return 'Gemini is experiencing a temporary demand spike. Please tap Try Again in a moment.';
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'Too many requests right now. Please wait a few seconds and try again.';
  }
  if (msg.startsWith('{')) {
    try {
      const parsed = JSON.parse(msg) as { error?: { message?: string } };
      if (parsed.error?.message) return parsed.error.message;
    } catch {
      // ignore parse failure
    }
  }
  return msg || fallback;
}

async function withTransientRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      return await fn();
    }
    throw err;
  }
}

function addDaysIso(baseDateIso: string, days: number): string {
  const parts = baseDateIso.split('-').map(Number);
  const d =
    parts.length === 3
      ? new Date(parts[0], parts[1] - 1, parts[2] + days)
      : new Date(Date.now() + days * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeDateString(raw: unknown, fallbackDate: string): string {
  if (typeof raw !== 'string') return fallbackDate;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Handle MM/YYYY or MM/YY
  const mmyyyy = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmyyyy) {
    const month = Number(mmyyyy[1]);
    const year = Number(mmyyyy[2]);
    if (month >= 1 && month <= 12) {
      const lastDay = new Date(year, month, 0).getDate();
      return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
  }
  return fallbackDate;
}

function normalizeCategory(raw: unknown): 'Fridge' | 'Skincare' | 'Medicine' {
  if (raw === 'Skincare' || raw === 'Medicine' || raw === 'Fridge') return raw;
  return 'Fridge';
}

function classifyOpenFoodFactsCategory(tags: string[], productName: string): 'Fridge' | 'Skincare' | 'Medicine' {
  const joined = `${tags.join(' ')} ${productName}`.toLowerCase();
  if (
    /skincare|cosmetic|lotion|serum|cleanser|moisturizer|sunscreen|spf|cream|shampoo|soap|hygiene/.test(
      joined
    )
  ) {
    return 'Skincare';
  }
  if (/medicine|supplement|vitamin|pharmacy|tablet|capsule|syrup|pain|cold|allergy/.test(joined)) {
    return 'Medicine';
  }
  return 'Fridge';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // 1. AI Camera Expiry Stamp & Supermarket Receipt Scanner
  app.post('/api/scan', async (req, res) => {
    try {
      const { imageBase64, mimeType, mode, todayDate } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        mode?: 'expiry' | 'receipt';
        todayDate?: string;
      };

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Please provide an image to scan.' });
        return;
      }

      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
      const validMime =
        typeof mimeType === 'string' && mimeType.startsWith('image/')
          ? mimeType
          : 'image/jpeg';
      const today =
        typeof todayDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayDate)
          ? todayDate
          : new Date().toISOString().slice(0, 10);

      const scanMode = mode === 'receipt' ? 'receipt' : 'expiry';
      const prompt =
        scanMode === 'receipt'
          ? `Analyze this supermarket or pharmacy receipt photo. Today's date is ${today}.
Extract every perishable, grocery, skincare, or medicine item purchased (ignore bags, tax, discounts, totals, store info).
For each item:
- Clean up abbreviated receipt names into clear human-readable product names (max 60 chars).
- Assign category strictly to one of: "Fridge", "Skincare", "Medicine".
- Estimate a realistic expiration date in YYYY-MM-DD format relative to ${today} (e.g., fresh greens ~5 days, milk ~7 days, yogurt ~14 days, sauces/condiments ~60 days, skincare ~180 days, medicine ~365 days).
- Add a brief note such as "Estimated shelf life from receipt".`
          : `Analyze this product packaging, bottle, or label photo. Today's date is ${today}.
Look closely for printed expiration dates (EXP, BB, Best By, Use By, PAO symbols like 6M/12M) and product name.
Extract the item(s) visible:
- Clear product name (max 60 chars). If only a date stamp is visible, name it "Scanned Item" or infer from packaging clues.
- Assign category strictly to one of: "Fridge", "Skincare", "Medicine".
- Parse the exact expiration date into YYYY-MM-DD format. If only Month/Year is printed (like 12/2026), use the last day of that month (2026-12-31). If no date is legible, estimate a reasonable default from ${today} and explain in note.
- Include the exact printed text found (e.g. "Printed EXP: 12/2026") in the note.`;

      const { ai, Type } = await getGeminiClient();
      const response = await withTransientRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: validMime,
                  data: cleanBase64,
                },
              },
              { text: prompt },
            ],
          },
          config: {
            systemInstruction:
              'You are a precise pantry inventory scanner. Extract structured JSON matching the schema accurately.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      category: { type: Type.STRING },
                      expiryDate: { type: Type.STRING },
                      note: { type: Type.STRING },
                    },
                    required: ['name', 'category', 'expiryDate'],
                  },
                },
              },
              required: ['items'],
            },
          },
        })
      );

      const rawText = (response.text ?? '{"items":[]}').trim();
      const parsed = JSON.parse(rawText) as {
        items?: Array<{
          name?: string;
          category?: string;
          expiryDate?: string;
          note?: string;
        }>;
      };

      const fallbackDate = addDaysIso(today, 7);
      const items = (parsed.items ?? [])
        .filter((entry) => typeof entry.name === 'string' && entry.name.trim().length > 0)
        .slice(0, 25)
        .map((entry) => ({
          name: String(entry.name).trim().slice(0, 80),
          category: normalizeCategory(entry.category),
          expiryDate: normalizeDateString(entry.expiryDate, fallbackDate),
          note:
            typeof entry.note === 'string' && entry.note.trim().length > 0
              ? entry.note.trim().slice(0, 120)
              : undefined,
        }));

      res.json({ items });
    } catch (error) {
      console.error('Gemini /api/scan error:', error);
      res.status(500).json({
        error: formatGeminiError(error, 'Failed to scan image with Gemini.'),
      });
    }
  });

  // 2. "Cook With What's Dying" 15-Minute Rescue Recipe Generator
  app.post('/api/recipe', async (req, res) => {
    try {
      const { ingredients, pantryItems } = req.body as {
        ingredients?: Array<{ name: string; daysLeft: number }>;
        pantryItems?: string[];
      };

      if (!Array.isArray(ingredients) || ingredients.length === 0) {
        res.status(400).json({ error: 'Provide at least one expiring fridge ingredient.' });
        return;
      }

      const listSummary = ingredients
        .slice(0, 12)
        .map((i) => `${i.name} (${i.daysLeft <= 0 ? 'expires today' : `${i.daysLeft}d left`})`)
        .join(', ');

      const availableSummary = Array.isArray(pantryItems)
        ? pantryItems
            .filter((name) => typeof name === 'string' && name.trim().length > 0)
            .slice(0, 30)
            .join(', ')
        : '';

      const { ai, Type } = await getGeminiClient();
      const response = await withTransientRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Create 3 distinct, realistic, delicious 15-minute rescue recipes that prioritize using these expiring fridge items: ${listSummary}.
${availableSummary ? `The user also currently has these items in their pantry/fridge: ${availableSummary}.` : ''}
For each recipe:
- Put ingredients already covered by their expiring or available items into "usedIngredients".
- Put any extra ingredients the user needs to buy or fetch that are NOT in their listed items (excluding water, salt, and black pepper) into "missingIngredients" as concise, shopping-list-ready item names (e.g. "Feta cheese", "Lemon", "Crusty bread", "Pasta" — no quantities or prep notes, max 50 chars each, 1 to 5 items).
- Put basic kitchen seasonings like salt, black pepper, or water into "pantryStaples".
- Keep steps concise and practical.`,
          config: {
            systemInstruction:
              'You are a pragmatic home chef specializing in zero-waste 15-minute weeknight meals.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                recipes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      prepMinutes: { type: Type.INTEGER },
                      cookMinutes: { type: Type.INTEGER },
                      servings: { type: Type.INTEGER },
                      usedIngredients: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      missingIngredients: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      pantryStaples: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      steps: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      tip: { type: Type.STRING },
                    },
                    required: [
                      'title',
                      'prepMinutes',
                      'cookMinutes',
                      'servings',
                      'usedIngredients',
                      'missingIngredients',
                      'pantryStaples',
                      'steps',
                      'tip',
                    ],
                  },
                },
              },
              required: ['recipes'],
            },
          },
        })
      );

      const rawText = (response.text ?? '{"recipes":[]}').trim();
      const parsed = JSON.parse(rawText) as {
        recipes?: Array<{
          title?: string;
          prepMinutes?: number;
          cookMinutes?: number;
          servings?: number;
          usedIngredients?: string[];
          missingIngredients?: string[];
          pantryStaples?: string[];
          steps?: string[];
          tip?: string;
        }>;
      };

      const cleanStringArray = (arr: unknown, maxLen: number) =>
        Array.isArray(arr)
          ? arr
              .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
              .map((v) => v.trim().slice(0, maxLen))
          : [];

      const recipes = (parsed.recipes ?? [])
        .filter((r) => typeof r.title === 'string' && r.title.trim().length > 0)
        .slice(0, 3)
        .map((r) => ({
          title: String(r.title).trim().slice(0, 100),
          prepMinutes: Math.max(1, Math.min(60, Number(r.prepMinutes) || 5)),
          cookMinutes: Math.max(0, Math.min(60, Number(r.cookMinutes) || 10)),
          servings: Math.max(1, Math.min(12, Number(r.servings) || 2)),
          usedIngredients: cleanStringArray(r.usedIngredients, 80),
          missingIngredients: cleanStringArray(r.missingIngredients, 80),
          pantryStaples: cleanStringArray(r.pantryStaples, 80),
          steps: cleanStringArray(r.steps, 280),
          tip: typeof r.tip === 'string' ? r.tip.trim().slice(0, 220) : '',
        }));

      if (recipes.length === 0) {
        res.status(502).json({ error: 'Could not craft recipes from those ingredients.' });
        return;
      }

      res.json({ recipe: recipes[0], recipes });
    } catch (error) {
      console.error('Gemini /api/recipe error:', error);
      res.status(500).json({
        error: formatGeminiError(error, 'Failed to generate rescue recipe.'),
      });
    }
  });

  // 3. Open Food Facts Barcode Auto-Fill Proxy
  app.get('/api/barcode/:code', async (req, res) => {
    try {
      const code = req.params.code.replace(/[^0-9A-Za-z]/g, '').slice(0, 32);
      if (!code || code.length < 4) {
        res.status(400).json({ error: 'Enter a valid barcode (at least 4 digits).' });
        return;
      }

      const upstream = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
        {
          headers: {
            'User-Agent': 'ShelflinePantryApp/1.0',
          },
        }
      );

      if (!upstream.ok) {
        res.status(upstream.status).json({ error: 'Barcode lookup service unavailable.' });
        return;
      }

      const data = (await upstream.json()) as {
        status?: number;
        product?: {
          product_name?: string;
          product_name_en?: string;
          brands?: string;
          categories_tags?: string[];
          image_front_small_url?: string;
          image_url?: string;
        };
      };

      if (data.status !== 1 || !data.product) {
        res.json({ found: false, barcode: code });
        return;
      }

      const rawName =
        data.product.product_name_en || data.product.product_name || 'Packaged Item';
      const brand = (data.product.brands || '').split(',')[0]?.trim() || '';
      const combinedName =
        brand && !rawName.toLowerCase().includes(brand.toLowerCase())
          ? `${brand} ${rawName}`
          : rawName;

      const category = classifyOpenFoodFactsCategory(
        data.product.categories_tags || [],
        combinedName
      );

      res.json({
        found: true,
        barcode: code,
        name: combinedName.trim().slice(0, 80),
        brand: brand.slice(0, 80),
        category,
        photoUrl: data.product.image_front_small_url || data.product.image_url || '',
      });
    } catch (error) {
      console.error('Barcode lookup error:', error);
      res.status(500).json({ error: 'Failed to look up barcode.' });
    }
  });

  // Vite middleware in dev, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      })
    );
    vitePromise.catch((err) => {
      console.error('Failed to initialize Vite dev middleware:', err);
    });

    app.use((req, res, next) => {
      vitePromise
        .then((vite) => vite.middlewares(req, res, next))
        .catch(next);
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  await new Promise<void>((resolve) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Shelfline server listening on http://localhost:${PORT}`);
      resolve();
    });
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
