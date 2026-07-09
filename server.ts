import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const { text, categories, months, currentDate } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Text prompt is required and must be a string' });
      return;
    }

    const ai = getGemini();

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
      model: "gemini-3.5-flash",
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

// Individual static folders
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/icons', express.static(path.join(__dirname, 'icons')));

// Individual static files at root
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'manifest.json'));
});
app.get('/service-worker.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'service-worker.js'));
});
app.get('/version.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'version.json'));
});
app.get('/offline.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'offline.html'));
});

// Primary index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Fallback for everything else
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
