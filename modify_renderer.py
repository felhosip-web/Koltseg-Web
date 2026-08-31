import re

with open('js/incoming-renderer.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the inner contents of render() with a simple comment or early return
# The method starts around line 11.
pattern = r'(render\(\)\s*\{)([\s\S]*?)(^\s+/\*\*)'
replacement = r'\1\n        // React handles rendering for Phase 17\n        // This vanilla render is retired.\n        return;\n    }\n\n\3'

new_content = re.sub(pattern, replacement, content, flags=re.MULTILINE)

with open('js/incoming-renderer.js', 'w', encoding='utf-8') as f:
    f.write(new_content)
