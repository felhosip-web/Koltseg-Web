import fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
    'const response = await ai.models.generateContent({\n      model: "gemini-3.5-flash",',
    'const response = await ai.models.generateContent({\n      model: modelToUse,'
);

fs.writeFileSync('server.ts', content);
