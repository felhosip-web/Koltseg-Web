# Patch növelés (0.0.1 → 0.0.2)
node scripts/build.js patch

# Minor növelés (0.0.1 → 0.1.0)
node scripts/build.js minor

# Major növelés (0.0.1 → 1.0.0)
node scripts/build.js major

# Changeloggal együtt
node scripts/build.js patch --changelog "Új funkció: Export bővítve"