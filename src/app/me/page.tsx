import { permanentRedirect } from 'next/navigation';

// The profile route was renamed to /whoami. This permanent redirect keeps
// any existing /me links (bookmarks, shared URLs) working.
export default function MeRedirect() {
  permanentRedirect('/whoami');
}
