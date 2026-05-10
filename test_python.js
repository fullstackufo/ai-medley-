import { execSync } from 'child_process';
try {
  console.log(execSync('python3 --version').toString());
  console.log(execSync('python3 -c "import librosa; import numpy; print(\'OK\')"').toString());
} catch(e) {
  console.error(e.message);
}
