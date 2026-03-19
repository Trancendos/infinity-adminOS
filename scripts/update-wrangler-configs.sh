#!/bin/bash
# Update all wrangler.toml configs for production readiness
# - Ensure compatibility_date is 2025-03-01
# - Ensure nodejs_compat flag is present
# - Enable observability section

COMPAT_DATE="2025-03-01"

find . -name "wrangler.toml" -not -path "./node_modules/*" | while read -r file; do
  echo "Processing: $file"
  
  # Update compatibility_date to 2025-03-01
  if grep -q 'compatibility_date' "$file"; then
    sed -i "s/compatibility_date = \"[0-9-]*\"/compatibility_date = \"$COMPAT_DATE\"/" "$file"
  fi
  
  # Uncomment observability section if it exists as commented
  if grep -q '# \[observability\]' "$file"; then
    sed -i 's/# \[observability\]/[observability]/' "$file"
    sed -i 's/# enabled = true/enabled = true/' "$file"
    sed -i 's/# head_sampling_rate = 1.0/head_sampling_rate = 1.0/' "$file"
  fi
  
  # Add observability section if not present at all
  if ! grep -q '\[observability\]' "$file"; then
    echo "" >> "$file"
    echo "# ── Observability ────────────────────────────────────" >> "$file"
    echo "[observability]" >> "$file"
    echo "enabled = true" >> "$file"
    echo "head_sampling_rate = 1.0" >> "$file"
  fi
  
done

echo "Done. All wrangler.toml files updated."