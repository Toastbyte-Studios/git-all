import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="max-w-6xl mx-auto px-4 pt-16 pb-12 text-center">
      <h1
        className="text-4xl font-bold mb-4"
        style={{ color: 'var(--text-primary)' }}
      >
        Profile not found
      </h1>
      <p className="text-base mb-8" style={{ color: 'var(--text-secondary)' }}>
        No GitAll profile exists at this URL yet.
      </p>
      <Link
        href="/"
        className="inline-block px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        style={{
          background: 'var(--accent)',
          color: '#0d1117',
        }}
      >
        Go to GitAll
      </Link>
    </main>
  );
}
