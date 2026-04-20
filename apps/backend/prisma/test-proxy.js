// Test login via Vite proxy (port 5173)
const http = require('http');

const data = JSON.stringify({ email: 'a@kat.pl', password: '123456' });

const options = {
    hostname: '127.0.0.1',
    port: 5173,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
    },
};

const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log('Headers:', JSON.stringify(res.headers));
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
        console.log('Response body:', body.substring(0, 500));
    });
});

req.on('error', (e) => {
    console.error('Connection error:', e.message);
});

req.write(data);
req.end();
