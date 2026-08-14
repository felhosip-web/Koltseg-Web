import fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf8');

const parseRoute = `// AI transaction parser route
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
`;

content = content.replace(/\/\/ AI transaction parser route\s+app\.post\('\/api\/ai\/parse', async \(req, res\) => \{\s+try \{\s+const \{ text, categories, months, currentDate \} = req\.body;\s+if \(!text \|\| typeof text !== 'string'\) \{\s+res\.status\(400\)\.json\(\{ error: 'Text prompt is required and must be a string' \}\);\s+return;\s+\}\s+const ai = getGemini\(\);/, parseRoute);

fs.writeFileSync('server.ts', content);
