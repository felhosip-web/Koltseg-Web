import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";
import webpush from 'web-push';

let rootDir = process.cwd();
try {
  if (typeof __dirname !== 'undefined') {
    rootDir = __dirname;
  }
} catch (e) {
  rootDir = process.cwd();
}

const app = express();
const PORT = 3000;

// Enable JSON body parsing for API requests
app.use(express.json());

// Lazy-initialized Gemini client
let aiClient: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// AI transaction parser route
app.post('/api/ai/parse', async (req, res) => {
  try {
    const { text, categories, months, currentDate, aiConfig } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Text prompt is required and must be a string' });
      return;
    }

    // Determine model
    const modelToUse = aiConfig?.model || "gemini-3.5-flash";

    // Determine API Key
    let ai;
    if (aiConfig?.apiKey && aiConfig.apiKey.trim() !== '') {
        ai = new GoogleGenAI({ 
            apiKey: aiConfig.apiKey.trim(),
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });
    } else {
        ai = getGemini(); // uses env
    }


    const systemInstruction = `You are a precise financial transaction parser. Your job is to parse a natural language input (usually in Hungarian) and structure it as a JSON transaction entry.
You are given:
1. The user's input text describing a transaction.
2. A list of existing categories: ${JSON.stringify(categories || [])}.
3. A list of existing months (format: YYYY-MM): ${JSON.stringify(months || [])}.
4. The current date context: ${currentDate || new Date().toISOString().split('T')[0]}.

Guidelines:
- "amount": Extract the numerical value (absolute, non-negative). Convert to number.
- "currency": Must be exactly "HUF" or "EUR". If Hungarian currency is mentioned (e.g. "Ft", "forint", "HUF"), use "HUF". If Euros are mentioned (e.g. "EUR", "euro"), use "EUR". Default to "HUF" if not specified.
- "paymentMethod": Must be exactly "Kártya" (for cards, card payments, online), "Készpénz" (for cash, physical money, zsebbe), or "Utalás" (for bank transfers, bank, utaltam). Default to "Kártya" if unclear.
- "category": Match the input to the best fitting category in the existing categories list.
  - If one of the existing categories fits perfectly or is semantically very close, use that exact category name.
  - If none of the existing categories fits well, output a new, highly relevant category name in Hungarian (starting with a capital letter, e.g. "Élelmiszer", "Rezsi", "Szórakozás", "Közlekedés", "Fizetés").
- "isNewCategory": Set to true if the chosen "category" is NOT in the provided existing categories list. Otherwise, set to false.
- "month": Format as "YYYY-MM" (e.g. "2026-07").
  - If a specific month is mentioned (e.g. "július", "augusztus", "múlt hónap", "következő hónap"), resolve it relative to the current date context.
  - If no month is mentioned, default to the month of the current date context.
- "isNewMonth": Set to true if the resolved "month" is NOT in the provided existing months list. Otherwise, set to false.
- "note": A concise, natural summary or note in Hungarian describing the purpose of the transaction (e.g., "Ebéd", "Fűnyírás", "Villanyszámla").`;

    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: `Input text to parse: "${text}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: {
              type: Type.NUMBER,
              description: "The numerical value of the transaction."
            },
            currency: {
              type: Type.STRING,
              description: "Must be exactly 'HUF' or 'EUR'."
            },
            paymentMethod: {
              type: Type.STRING,
              description: "Must be exactly 'Kártya', 'Készpénz', or 'Utalás'."
            },
            category: {
              type: Type.STRING,
              description: "The matched or suggested category name."
            },
            isNewCategory: {
              type: Type.BOOLEAN,
              description: "True if the category is not in the provided existing categories list."
            },
            month: {
              type: Type.STRING,
              description: "The target month in YYYY-MM format."
            },
            isNewMonth: {
              type: Type.BOOLEAN,
              description: "True if the month is not in the provided existing months list."
            },
            note: {
              type: Type.STRING,
              description: "A short, descriptive note in Hungarian."
            }
          },
          required: ["amount", "currency", "paymentMethod", "category", "isNewCategory", "month", "isNewMonth", "note"]
        }
      }
    });

    const parsedData = JSON.parse(response.text.trim());
    res.json(parsedData);
  } catch (error: any) {
    console.error('[AI Parser Error]:', error);
    res.status(500).json({ error: error.message || 'Hiba történt az AI feldolgozás során' });
  }
});

// Root developer password verification route for Access Guard emergency unlock and escalation
app.post('/api/security/verify-root', (req, res) => {
  try {
    const { password } = req.body;
    const rootPassword = process.env.ROOT_DEV_PASSWORD;
    
    if (!rootPassword) {
      res.status(503).json({ success: false, error: 'A root jelszó nincs konfigurálva a szerveren!' });
      return;
    }
    
    if (password && password.trim() === rootPassword.trim()) {
      res.json({ success: true, role: 'owner' });
    } else {
      res.status(401).json({ success: false, error: 'Helytelen fejlesztői jelszó!' });
    }
  } catch (err: any) {
    console.error('[Verify Root Error]:', err);
    res.status(500).json({ success: false, error: 'Szerver hiba a jelszó ellenőrzésekor.' });
  }
});

// ================================================================
// === WEB PUSH API ===
// ================================================================

// VAPID kulcsok (környezeti változókból, vagy alapértelmezett teszt kulcsok)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@koltsegnyilvantarto.hu';

// In-memory push subscription tároló
const pushSubscriptions: Map<string, any> = new Map();

// Web Push beállítása
try {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.log('[PUSH] ✅ Web Push VAPID konfigurálva');
  } else {
    console.log('[PUSH] ⚠️ VAPID kulcsok nincsenek beállítva (.env)');
  }
} catch (e) {
  console.log('[PUSH] ℹ️ Hiba a VAPID kulcsok beállításakor:', e);
}

// VAPID public key kiszolgálása
app.get('/api/push/vapid-public', (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    res.status(404).json({ error: 'VAPID public key nincs beállítva' });
    return;
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Push subscription regisztrálása
app.post('/api/push/subscribe', (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      res.status(400).json({ error: 'Érvénytelen subscription' });
      return;
    }

    pushSubscriptions.set(subscription.endpoint, subscription);
    console.log(`[PUSH] ✅ Új subscription regisztrálva (összesen: ${pushSubscriptions.size})`);
    res.json({ success: true, count: pushSubscriptions.size });
  } catch (err: any) {
    console.error('[PUSH] Subscribe hiba:', err);
    res.status(500).json({ error: err.message });
  }
});

// Push subscription törlése
app.post('/api/push/unsubscribe', (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      pushSubscriptions.delete(endpoint);
      console.log(`[PUSH] Subscription törölve (maradt: ${pushSubscriptions.size})`);
    }
    res.json({ success: true, count: pushSubscriptions.size });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Push értesítés küldése az összes feliratkozottnak
app.post('/api/push/send', async (req, res) => {
  if (!webpush || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    res.status(503).json({ error: 'Web Push nincs konfigurálva (hiányzó VAPID kulcsok)' });
    return;
  }

  try {
    const payload = JSON.stringify(req.body);
    const results = { sent: 0, failed: 0, errors: [] as string[] };

    const sendPromises = Array.from(pushSubscriptions.entries()).map(async ([endpoint, subscription]) => {
      try {
        await webpush.sendNotification(subscription, payload);
        results.sent++;
      } catch (err: any) {
        results.failed++;
        results.errors.push(`${endpoint.substring(0, 50)}...: ${err.message}`);
        
        // Ha a subscription lejárt vagy érvénytelen, töröljük
        if (err.statusCode === 404 || err.statusCode === 410) {
          pushSubscriptions.delete(endpoint);
          console.log(`[PUSH] Lejárt subscription törölve: ${endpoint.substring(0, 50)}`);
        }
      }
    });

    await Promise.all(sendPromises);
    console.log(`[PUSH] Küldés kész: ${results.sent} sikeres, ${results.failed} hibás`);
    res.json(results);
  } catch (err: any) {
    console.error('[PUSH] Send hiba:', err);
    res.status(500).json({ error: err.message });
  }
});

// Push státusz
app.get('/api/push/status', (req, res) => {
  res.json({
    configured: !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
    webpushAvailable: !!webpush,
    subscriptionCount: pushSubscriptions.size,
    vapidSubject: VAPID_SUBJECT
  });
});

// Individual static folders
app.use('/css', express.static(path.join(rootDir, 'css')));
app.use('/js', express.static(path.join(rootDir, 'js')));
app.use('/icons', express.static(path.join(rootDir, 'icons')));
app.use('/Koltseg-Web/assets', express.static(path.join(rootDir, 'assets')));

// Individual static files at root
app.get('/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(rootDir, 'manifest.json'));
});
app.get('/service-worker.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(rootDir, 'service-worker.js'));
});
app.get('/version.json', (req, res) => {
  res.sendFile(path.join(rootDir, 'version.json'));
});
app.get('/settings.json', (req, res) => {
  res.sendFile(path.join(rootDir, 'settings.json'));
});
app.get('/offline.html', (req, res) => {
  res.sendFile(path.join(rootDir, 'offline.html'));
});

// Primary index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

// Fallback for everything else
app.get('*', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`[Startup Diagnostics] rootDir resolved to: ${rootDir}`);
  console.log(`[Startup Diagnostics] index.html exists: ${fs.existsSync(path.join(rootDir, 'index.html'))}`);
  console.log(`[Startup Diagnostics] js/app.js exists: ${fs.existsSync(path.join(rootDir, 'js/app.js'))}`);
  console.log(`[Startup Diagnostics] css/style.css exists: ${fs.existsSync(path.join(rootDir, 'css/style.css'))}`);
});
