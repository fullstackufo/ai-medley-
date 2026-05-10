import http from 'http';

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/start',
  method: 'POST',
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
