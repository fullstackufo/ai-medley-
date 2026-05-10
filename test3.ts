import http from 'http';
import fs from 'fs';
import path from 'path';

const dummyFile = path.join(process.cwd(), 'dummy_large.wav');
// 40MB file
fs.writeFileSync(dummyFile, Buffer.alloc(40 * 1024 * 1024, 'a'));

const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
let postDataStart = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="dummy.wav"\r\nContent-Type: audio/wav\r\n\r\n`;
let postDataEnd = `\r\n--${boundary}--\r\n`;

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/start',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': Buffer.byteLength(postDataStart) + fs.statSync(dummyFile).size + Buffer.byteLength(postDataEnd)
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

req.write(postDataStart);
const stream = fs.createReadStream(dummyFile);
stream.on('data', (chunk) => req.write(chunk));
stream.on('end', () => {
  req.end(postDataEnd);
});
