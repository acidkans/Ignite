// Test login endpoint directly
const http = require('http');

const data = JSON.stringify({ email: 'a@kat.pl', password: '123456' });

const options = {
    hostname: '127.0.0.1',
    port: 3001,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
    },
};

const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
        console.log('Response:', body);
    });
});

req.on('error', (e) => {
    console.error('Connection error:', e.message);
});

req.write(data);
req.end();
