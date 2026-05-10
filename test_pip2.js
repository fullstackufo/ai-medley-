import { execSync } from 'child_process';
try {
  console.log(execSync('python3 -m pip install librosa numpy').toString());
} catch(e) {
  console.error(e.message);
}
