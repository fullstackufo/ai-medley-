import http from 'http';
import fs from 'fs';
import path from 'path';

// Create a dummy file
const dummyFile = path.join(process.cwd(), 'dummy.wav');
fs.writeFileSync(dummyFile, 'dummy audio data');

const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
let postData = '';

postData += `--${boundary}\r\n`;
postData += `Content-Disposition: form-data; name="files"; filename="dummy.wav"\r\n`;
postData += `Content-Type: audio/wav\r\n\r\n`;
postData += fs.readFileSync(dummyFile, 'utf8') + '\r\n';
postData += `--${boundary}--\r\n`;

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/start',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': Buffer.byteLength(postData)
  }
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

req.write(postData);
req.end();
