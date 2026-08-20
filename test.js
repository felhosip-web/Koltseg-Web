const { execSync } = require('child_process');
try {
  execSync('git push -f origin fix-release-drafter');
} catch (e) {
  if (e.stdout) console.log(e.stdout.toString());
  if (e.stderr) console.log(e.stderr.toString());
  process.exitCode = 1;
}
