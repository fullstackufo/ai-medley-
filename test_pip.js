import { execSync } from 'child_process';
try {
  console.log(execSync('pip3 install librosa numpy').toString());
} catch(e) {
  console.error(e.message);
}
