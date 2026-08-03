export const dynamic = 'force-static';

const SECURITY_TXT = `Contact: https://github.com/Toastbyte-Studios/git-all/security/advisories/new
Policy: https://github.com/Toastbyte-Studios/git-all/security/policy
Expires: 2027-08-01T00:00:00.000Z
Preferred-Languages: en
Canonical: https://gitall.app/.well-known/security.txt
`;

export function GET() {
  return new Response(SECURITY_TXT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
