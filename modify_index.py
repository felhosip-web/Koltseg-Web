import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace inner content of #tab-incoming
pattern = r'(<div id="tab-incoming" class="tab-pane hidden">)(.*?)(</div>\s*</div><!-- /tabContent -->)'
replacement = r'\1\n                <div id="costAppIncomingRoot"></div>\n            \3'

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(new_content)
