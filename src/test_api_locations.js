const http = require('http');

http.get('http://localhost:3000/api/db/fire_hydrants', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log(`Fetched ${json.data?.length} items from local API endpoint.`);
      let validCount = 0;
      let nullCount = 0;
      let invalidCount = 0;
      
      json.data.forEach(item => {
        if (!item.location) {
          nullCount++;
        } else if (typeof item.location === 'string' && /^[0-9a-fA-F]+$/.test(item.location)) {
          validCount++;
        } else {
          invalidCount++;
          console.log(`Invalid location format for ${item.no}:`, typeof item.location, item.location);
        }
      });
      
      console.log(`Summary: Valid WKB Hex: ${validCount}, Null: ${nullCount}, Other: ${invalidCount}`);
    } catch (e) {
      console.error('Error parsing JSON:', e.message);
    }
  });
}).on('error', (err) => {
  console.error('HTTP request failed:', err.message);
});
