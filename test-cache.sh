#!/bin/bash

# Test cache mechanism with single request
API_KEY="YOUR_EBIRD_API_KEY"  # Replace with actual key
REGION="SG"
START_DATE="2025-09-25"
END_DATE="2025-09-25"  # Same day = only 20 requests (one per year back)

echo "=== FIRST REQUEST (should hit API) ==="
curl -s -X POST http://localhost:3000/api/ebird/historic-start/$REGION \
  -H "Content-Type: application/json" \
  -d "{\"api_key\":\"$API_KEY\",\"start_date\":\"$START_DATE\",\"end_date\":\"$END_DATE\",\"force_refresh\":false}" | jq .

# Wait a bit for background task to complete
echo ""
echo "Waiting for first request to complete (polling)..."
sleep 2

# Make second request (same params, should use cache)
echo ""
echo "=== SECOND REQUEST (should use CACHE) ==="
curl -s -X POST http://localhost:3000/api/ebird/historic-start/$REGION \
  -H "Content-Type: application/json" \
  -d "{\"api_key\":\"$API_KEY\",\"start_date\":\"$START_DATE\",\"end_date\":\"$END_DATE\",\"force_refresh\":false}" | jq .

echo ""
echo "Check terminal for ✅ CACHE vs 🌐 API logs"
