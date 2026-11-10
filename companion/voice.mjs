import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export async function transcribe(bytes) {
  const dir = await mkdtemp(join(tmpdir(), 'onion-voice-'));
  const file = join(dir, 'recording');
  try {
    await writeFile(file, bytes, { mode: 0o600 });
    return await new Promise((resolve, reject) => {
      const child = spawn('/opt/voice/bin/python', ['/app/transcribe.py', file], { stdio: ['ignore', 'pipe', 'ignore'] });
      let output = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Transcription timed out. Try a shorter recording.')); }, 90_000);
      child.stdout.on('data', chunk => { output += chunk; if (output.length > 32_000) child.kill('SIGKILL'); });
      child.on('error', () => { clearTimeout(timer); reject(new Error('Voice is unavailable.')); });
      child.on('close', code => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error('Could not transcribe this recording. Try again or type.'));
        try { resolve(JSON.parse(output)); } catch { reject(new Error('Invalid transcription response.')); }
      });
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
}
