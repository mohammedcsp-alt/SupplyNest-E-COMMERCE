/**
 * Creates the remote ADMIN_TESTER staff account (approved permission matrix). Run it yourself in a terminal:
 *   npm run tester:create -- --phone 07XXXXXXXXX --name "Tester name"
 * The temporary password is typed at a hidden prompt (twice). It is never printed, logged, stored in a file or passed as an
 * argument. The tester changes it at first sign-in (/account/password). Requires an existing owner account.
 */
import { getOwnerUserId } from '../src/modules/admin/owner';
import { createAdminTesterAccount } from '../src/modules/admin/tester-role';
import { loadCurrentUserByUserId } from '../src/lib/session';
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
    console.error('Usage: npm run tester:create -- --phone 07XXXXXXXXX --name "Tester name"');
    process.exit(1);
  }
  const ownerId = await getOwnerUserId();
  if (!ownerId) {
    console.error('No owner account exists. Nothing was created.');
    process.exit(1);
  }
  const owner = await loadCurrentUserByUserId(ownerId);
  if (!owner) {
    console.error('Owner account could not be loaded. Nothing was created.');
    process.exit(1);
  }
  const password = await readHidden('Temporary password for the tester (hidden): ');
  const confirm = await readHidden('Repeat the temporary password (hidden): ');
  if (password !== confirm) {
    console.error('The two passwords do not match. Nothing was created.');
    process.exit(1);
  }
  const created = await createAdminTesterAccount({ ownerId, ownerPermissions: owner.permissions, phone, fullNameEn: name, password });
  console.log(`ADMIN_TESTER account created for ${created.phone.slice(0, 6)}••••${created.phone.slice(-2)} (id ${created.id}), roles: ${created.roles.join(', ')}.`);
  console.log('Send the temporary password to the tester through a secure channel. The tester must change it at first sign-in.');
}

main()
  .catch((err) => {
    if (err instanceof AppError) console.error(`Refused: ${err.message}`);
    else console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
