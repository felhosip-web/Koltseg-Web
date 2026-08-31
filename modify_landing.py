import re

with open('src/landing.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
import_str = "import IncomingTab from './components/incoming/IncomingTab.jsx'\n"
content = import_str + content

# Add rendering block
render_block = """
const incomingRoot = document.getElementById('costAppIncomingRoot');
if (incomingRoot) {
    ReactDOM.createRoot(incomingRoot).render(
      <React.StrictMode>
        <IncomingTab />
      </React.StrictMode>,
    )
}
"""

content = content + render_block

with open('src/landing.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
