const { execSync } = require('child_process');
try {
  execSync('git push -f origin fix-release-drafter');
} catch (e) {
  console.log(e.stdout.toString(), e.stderr.toString());
}
