import { redirect } from 'next/navigation';

// Direct address for the administration sign-in panel. The panel itself lives on /login (portal=admin).
export default function AdminLoginRedirect() {
  redirect('/login?portal=admin');
}
