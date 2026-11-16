/**
 * Creates the permanent system owner account (MANAGER role, all permissions). Run it yourself in a terminal:
 *   npm run owner:create -- --phone 07XXXXXXXXX --name "Your name"
 * The password is typed at a hidden prompt (twice). It is never printed, logged, stored in a file or passed as an argument.
 * Refuses when there is no interactive terminal, and refuses when an owner already exists.
 */
import { createOwnerAccount } from '../src/modules/admin/owner';
import { AppError } from '../src/lib/errors';

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error('Run this command in an interactive terminal (no hidden prompt is available here).'));
    process.stdout.write(prompt);
    let buffer = '';
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(buffer);
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') buffer = buffer.slice(0, -1);
        else buffer += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const phone = argValue('phone');
  const name = argValue('name');
  if (!phone || !name) {
    console.error('Usage: npm run owner:create -- --phone 07XXXXXXXXX --name "Owner name"');
    process.exit(1);
  }
  const password = await readHidden('New owner password (hidden): ');
  const confirm = await readHidden('Repeat the password (hidden): ');
  if (password !== confirm) {
    console.error('The two passwords do not match. Nothing was created.');
    process.exit(1);
  }
  const created = await createOwnerAccount({ phone, fullName: name, password });
  console.log(`Owner account created for ${created.phone.slice(0, 6)}••••${created.phone.slice(-2)} (id ${created.userId}).`);
  console.log('Sign in at /login with this phone number and your password, then open /admin.');
}

main().catch((err: unknown) => {
  if (err instanceof AppError) console.error(`Not created: ${err.message}`);
  else console.error(`Not created: ${(err as Error).message}`);
  process.exit(1);
});
