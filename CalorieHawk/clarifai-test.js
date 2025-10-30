// Quick Clarifai auth test script
// Usage:
//   $env:CLARIFAI_API_KEY = 'key-...'; node clarifai-test.js

const KEY = process.env.CLARIFAI_PAT || process.env.CLARIFAI_API_KEY || process.env.CLEARIFAI_API_KEY;

if (!KEY) {
  console.error('Set CLARIFAI_API_KEY environment variable before running this test.');
  process.exit(1);
}

async function test() {
  const body = {
    user_app_id: { user_id: 'clarifai', app_id: 'main' },
    inputs: [{ data: { image: { url: 'https://samples.clarifai.com/metro-north.jpg' } } }]
  };

  try {
    const r = await fetch('https://api.clarifai.com/v2/models/food-item-recognition/versions/1d5fd481e0cf4826aa72ec3ff049e044/outputs', {
      method: 'POST',
      headers: {
        Authorization: `Key ${KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
    });

    console.log('HTTP', r.status);
    const txt = await r.text();
    try { console.log(JSON.parse(txt)); } catch(e) { console.log(txt); }
  } catch (err) {
    console.error('Fetch error', err);
  }
}

test();
