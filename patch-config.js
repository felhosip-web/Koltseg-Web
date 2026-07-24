import fs from 'fs';
let content = fs.readFileSync('js/oop-core.js', 'utf8');

const aiConfigReplace = `
        this.supabaseConfig = {
            url: localStorage.getItem('supabase_url') || '',
            key: localStorage.getItem('supabase_key') || ''
        };
        this.aiConfig = {
            apiKey: localStorage.getItem('ai_api_key') || '',
            model: localStorage.getItem('ai_model') || 'gemini-3.5-flash'
        };`;

content = content.replace(/this\.supabaseConfig = \{[^}]+\};/s, aiConfigReplace);
fs.writeFileSync('js/oop-core.js', content);
