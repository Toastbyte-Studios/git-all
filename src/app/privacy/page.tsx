import type { Metadata } from 'next';
import type React from 'react';

// Every factual claim on this page was written against the code as it actually
// behaves, not from a boilerplate template. If you change any of the following,
// re-read this page and update it in the same PR:
//
//   src/lib/auth-session.ts          cookie names, contents, lifetimes
//   src/lib/auth-cookies.ts          what sign-out / deletion clears
//   src/lib/profiles.ts              what D1 stores; the public projection
//   src/lib/analytics-server.ts      the GA4 client_id derivation; the gate
//   src/lib/analytics-client.ts      the Zaraz / server-fallback split
//   src/lib/analytics-consent.ts     the consent cookie and the exempt event
//   src/lib/client-ip.ts             which header the client_id IP comes from
//   src/app/embed/[slug]/route.ts    what an embed impression records
//   migrations/                      the columns described under "On our servers"
//
// The retention figures below are read from the GA4 property, not from code.
// If anyone changes them in GA4 Admin → Data collection and modification →
// Data retention, they must be changed here too.
//
// Three claims were verified against things outside this file. Re-verify them
// when reviewing this page:
//
//   Zaraz GA4 cookies                read from a live browser 2026-08-04:
//                                    cfz_google-analytics_v4 (~1 year) and
//                                    cfzs_google-analytics_v4 (session), both
//                                    HttpOnly, Secure, Lax. cf_clearance
//                                    (under "Hosting and service logs") was
//                                    observed in the same session. Re-verify
//                                    if the Zaraz tool config changes.
//   trackClientEvent call sites      audited 2026-08-04: lookupRun
//                                    (authenticated, entry_count,
//                                    includes_gitea), timeRangeSelected
//                                    (period preset, mode), integratedViewUsed
//                                    (entry_count), embedGenerated
//                                    (snippet_type, platform_count). No
//                                    usernames, no custom dates. The example
//                                    list under "Analytics" and the
//                                    local-storage section reflect this
//                                    inventory — re-audit if events or their
//                                    params change.
//   dataprivacyframework.gov         Cloudflare's and Google's certifications,
//                                    cited under "Where your data is
//                                    processed". Verified active 2026-08-03.
//
// A privacy policy that has drifted from the code is worse than no policy.

export const metadata: Metadata = {
  title: 'Privacy Policy — GitAll',
  description:
    'How GitAll handles your data: what we store, what we send to analytics, and how to delete your account.',
  alternates: { canonical: 'https://gitall.app/privacy' },
};

const EFFECTIVE_DATE = 'August 4, 2026';
const LAST_UPDATED_DATE = 'August 25, 2026';
const GA4_EVENT_RETENTION = '2 months';
const GA4_USER_RETENTION = '14 months';

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-10">
      <h2
        id={`${id}-heading`}
        className="text-lg font-semibold mb-3"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </h2>
      <div
        className="space-y-3 text-sm leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 pt-8 pb-12">
      <h1
        className="text-2xl font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        Privacy Policy
      </h1>
      <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
        Effective {EFFECTIVE_DATE} · Last updated {LAST_UPDATED_DATE}
      </p>

      <Section id="who" title="Who we are">
        <p>
          GitAll (gitall.app) is operated by Toastbyte Studios, LLC. For any
          privacy question or request, email{' '}
          <a
            href="mailto:support@toastbyte.studio"
            className="hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            support@toastbyte.studio
          </a>
          .
        </p>
      </Section>

      <Section id="scope" title="What this policy covers">
        <p>
          This policy covers the GitAll website and the contribution heatmap
          images we serve at gitall.app/embed. Those images are meant to be
          embedded in READMEs and personal sites, so this policy also describes
          what happens when you load a page elsewhere that contains one — see
          “Embedded heatmaps” below.
        </p>
        <p>
          It does not cover GitHub, GitLab, Bitbucket, Gitea, or Forgejo. When
          you use GitAll to look up contribution data, that data comes from
          those platforms under their own terms and privacy policies.
        </p>
      </Section>

      <Section id="anonymous" title="Using GitAll without an account">
        <p>
          You do not need an account. If you type a username into the lookup
          form, we send it to the relevant platform’s public API and show you
          what comes back. We keep the result in a short-lived server-side cache
          (around 15 minutes) so repeated lookups are fast. We do not create a
          record for you, and beyond that short-lived cache we keep no record of
          the usernames you look up.
        </p>
      </Section>

      <Section id="signin" title="Signing in">
        <p>
          Signing in with GitHub, GitLab, or Bitbucket is optional. It exists so
          you can verify an account is yours and combine several accounts into
          one view.
        </p>
        <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          What we receive from the provider
        </h3>
        <p>
          When you authorize GitAll, the provider gives us an access token and
          we read your account ID, username, and avatar URL. We request minimal
          read-only scopes. We never receive your password.
        </p>
        <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          What we store in your browser
        </h3>
        <p>
          These are all HttpOnly cookies, encrypted with AES-GCM, sent only over
          HTTPS in production, and marked SameSite=Lax:
        </p>
        <ul className="space-y-2 list-disc pl-5">
          <li>
            <code>gitall_session</code> — your connected accounts (provider,
            account ID, username, avatar URL, verification time) and your GitAll
            user ID. Access tokens are deliberately excluded. Expires after 7
            days.
          </li>
          <li>
            <code>gitall_token_&lt;provider&gt;</code> — the provider access
            token, stored separately from the session. Expires after 7 days.
          </li>
          <li>
            <code>gitall_oauth_state_&lt;provider&gt;</code> — a one-time value
            protecting the sign-in flow. Expires after 10 minutes.
          </li>
          <li>
            <code>gitall_oauth_return_to_&lt;provider&gt;</code> — the page to
            send you back to after sign-in. Cleared on completion.
          </li>
        </ul>
        <p>
          Signing out, or deleting your account, expires all of them. Separate
          cookies used for analytics and security are described under
          “Analytics” and “Hosting and service logs” below.
        </p>
        <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          What we store on our servers
        </h3>
        <p>We keep a profile record in Cloudflare D1, our database:</p>
        <ul className="space-y-2 list-disc pl-5">
          <li>
            Your account: a GitAll user ID, your handle, a display name, which
            provider is primary, when you last changed your handle, whether your
            profile is public, and creation and update timestamps.
          </li>
          <li>
            One record per connected account: the provider, the account ID, the
            username, the avatar URL, and when it was verified.
          </li>
        </ul>
        <p>
          We keep this until you delete your account. Deleting removes both the
          account record and every connected-account record.
        </p>
      </Section>

      <Section id="profile" title="Your public profile">
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>
            Your profile is private by default.
          </strong>{' '}
          Signing in does not publish anything.
        </p>
        <p>
          You can publish it from your settings, which makes
          gitall.app/u/&lt;your-handle&gt; readable by anyone and eligible to be
          listed in our sitemap and indexed by search engines. A published
          profile shows your handle, your display name, and the username and
          avatar for each connected account. It does not show your GitAll user
          ID or your provider account IDs.
        </p>
        <p>
          While your profile is private, that URL returns “not found” to
          everyone except you. You can switch it back to private at any time;
          the change takes effect immediately on our side, though browsers and
          other caches may hold a copy of the page for up to a minute.
        </p>
      </Section>

      <Section id="contributions" title="Contribution data for signed-in users">
        <p>
          When you are signed in, we fetch your contribution data using your own
          access token rather than the public API. Depending on the provider and
          the scopes you granted, this may include activity in private
          repositories. We use it to render your heatmap and we do not store it
          — it is fetched for the page you are looking at and discarded.
        </p>
      </Section>

      <Section id="analytics" title="Analytics">
        <p>
          We use analytics to understand how the site is used. We do not use it
          to build advertising profiles, and we have Google Analytics configured
          to request non-personalized ads handling.
        </p>
        <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          Cloudflare Web Analytics
        </h3>
        <p>
          Every page load is counted by Cloudflare Web Analytics. It sets no
          cookies, uses no client-side state, and does not track you across
          sites.
        </p>
        <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          Google Analytics 4
        </h3>
        <p>
          We send a small set of product events to Google Analytics 4 — things
          like a lookup being run, a sign-in completing, an embed being served,
          or a profile being viewed. Events reach GA4 either from your browser
          through Cloudflare Zaraz, which serves the analytics script from our
          own domain, or from our servers via the GA4 Measurement Protocol. On
          the browser path, Zaraz manages the Google Analytics identifier on our
          behalf, using the cookies listed below.
        </p>
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>
            We do not send your handle, your username, or any provider account
            ID to GA4.
          </strong>{' '}
          Events carry only non-identifying details: which platforms were
          involved, how many accounts are connected, which time-range preset or
          view you picked, and the format or theme of an embed snippet. If you
          pick a custom date range, the event says only that a custom range was
          used — never the dates themselves.
        </p>
        <p>
          Server-sent events are attached to a pseudonymous identifier: a
          SHA-256 hash of your IP address, browser user-agent string, and
          language preference. We do not set an analytics cookie for these
          server-sent events. We call the identifier pseudonymous rather than
          anonymous because someone who already knew a specific IP address and
          browser could, in principle, check it against the identifier — so we
          treat it as personal data even though it is not readable on its own.
        </p>
        <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          If we ask you for an analytics choice
        </h3>
        <p>
          Where your local law requires consent before analytics, we show a
          banner asking you to accept or decline, and we record your answer in
          the <code>analytics-consent</code> cookie described below.
        </p>
        <p>
          Declining stops <em>both</em> paths described above — the browser one
          and the server one. It is not merely a request to the analytics
          script; our own servers check the same recorded answer before sending
          anything to Google, so events like a lookup, a sign-in, or a profile
          view are not sent at all. Until you answer, we treat the absence of an
          answer as a decline rather than as permission.
        </p>
        <p>
          There is one exception, and it is a technical one rather than a
          convenience: heatmap images embedded on other people’s sites. It is
          described under “Embedded heatmaps” below, and it is the only
          exception.
        </p>
        <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          Analytics cookies
        </h3>
        <p>
          The browser path does set cookies. Zaraz creates two first-party
          cookies on gitall.app for Google Analytics:
        </p>
        <ul className="space-y-2 list-disc pl-5">
          <li>
            <code>cfz_google-analytics_v4</code> — the identifier and engagement
            state Zaraz maintains for Google Analytics. Kept for up to one year.
          </li>
          <li>
            <code>cfzs_google-analytics_v4</code> — state for your current
            visit, such as a pageview count. Deleted when you close your
            browser.
          </li>
        </ul>
        <p>
          Both are HttpOnly, sent only over HTTPS, marked SameSite=Lax, and set
          for gitall.app alone — they do not follow you to other sites.
        </p>
        <p>
          Where we ask for an analytics choice, a third cookie records it:
        </p>
        <ul className="space-y-2 list-disc pl-5">
          <li>
            <code>analytics-consent</code> — the single word{' '}
            <code>granted</code> or <code>denied</code>, and nothing else. No
            identifier, no timestamp, nothing that distinguishes you from anyone
            else who answered the same way. Kept for up to one year, set for
            gitall.app alone, and sent only over HTTPS in production.
          </li>
        </ul>
        <p>
          Unlike every other cookie on this page, this one is deliberately not
          HttpOnly: the banner itself has to be able to read your answer, so
          that it stops asking, and write it when you click. Our servers read it
          too, which is the point — it is what makes a decline binding on the
          server path rather than a request the browser makes on your behalf.
        </p>
        <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          How long Google keeps it
        </h3>
        <p>
          Google deletes individual event records for our property after{' '}
          {GA4_EVENT_RETENTION}. Data held against the pseudonymous identifier
          above is kept for {GA4_USER_RETENTION}.
        </p>
        <p>
          That second window restarts whenever the same identifier is seen
          again. If you visit GitAll regularly — or regularly load a page
          containing one of our embeds — it will keep restarting, so in practice
          it does not expire while you are still active. It only begins counting
          down once we stop seeing you.
        </p>
        <p>
          Aggregated reporting totals are kept longer by Google and are not
          affected by either setting.
        </p>
        <p>
          Google explains how it uses data from sites that use its services at{' '}
          <a
            href="https://policies.google.com/technologies/partner-sites"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            policies.google.com/technologies/partner-sites
          </a>
          .
        </p>
        <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          Embedded heatmaps
        </h3>
        <p>
          If you load a page anywhere on the web that embeds a GitAll heatmap —
          a GitHub README, a personal site — your browser requests that image
          from our servers. We record that as an event containing the hostname
          of the page you were viewing (not the full URL) and the pseudonymous
          identifier described above.
        </p>
        <p>
          This happens even if you have never visited gitall.app yourself. We
          are describing it here because it is the honest description of what
          the embed does. The identifier is not linked to any account, ours or
          anyone else’s.
        </p>
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>
            We do not ask for your consent before recording this, and we cannot.
          </strong>{' '}
          The image is requested by a page on someone else’s site, and on GitHub
          it is fetched through an image proxy that sends no cookies at all — so
          there is no answer of yours available to us at that moment, whether or
          not you have given one on gitall.app. We record the impression
          regardless, and this is the only analytics event for which that is
          true.
        </p>
        <p>
          What we can tell you is that the identifier here is worse at
          identifying you than the one described above, not better. Because the
          proxy fetches the image on your behalf, the IP address that reaches us
          is the proxy’s rather than yours, so readers of the same embed are
          largely counted together rather than told apart.
        </p>
      </Section>

      <Section id="local-storage" title="Data stored locally in your browser">
        <p>
          GitAll keeps a few preferences in your browser’s local storage: your
          theme, your contribution view mode, and your selected time range. They
          are tied to no account, and clearing your browser data removes them.
          Your analytics choice is not among them — it is a cookie, for the
          reason given under “Analytics cookies” above.
        </p>
        <p>
          Our servers never read this storage. Acting on a preference can,
          however, fire one of the analytics events described above that names
          the choice — selecting a time-range preset is an example — so the
          choice itself may be counted even though the stored value is not read.
        </p>
      </Section>

      <Section id="logs" title="Hosting and service logs">
        <p>
          Like any website, gitall.app is delivered by a host — in our case
          Cloudflare — which processes the IP address and request metadata of
          every request in order to serve the site and to detect and block
          abuse. This happens for every visitor and is separate from the
          analytics described above.
        </p>
        <p>
          As part of that protection, Cloudflare may set a{' '}
          <code>cf_clearance</code> cookie after your browser passes one of its
          security checks, so that you are not re-challenged on every request.
          It is a security cookie, not an analytics one, and can persist for up
          to a year.
        </p>
      </Section>

      <Section id="processors" title="Who processes your data">
        <ul className="space-y-2 list-disc pl-5">
          <li>
            Cloudflare — hosting, our D1 database, Web Analytics, and Zaraz.
          </li>
          <li>Google — Google Analytics 4.</li>
        </ul>
        <p>
          We do not sell your personal data, and we do not share it with anyone
          else for their own purposes.
        </p>
      </Section>

      <Section id="transfers" title="Where your data is processed">
        <p>
          We are a United States company, and Cloudflare and Google process data
          for us in the United States. Cloudflare also operates a global edge
          network, so your requests may be handled at a data centre near you
          before reaching the US.
        </p>
        <p>
          If you are in the European Economic Area, the United Kingdom, or
          Switzerland, these transfers rely on the EU–US Data Privacy Framework,
          its UK extension, and the Swiss–US Data Privacy Framework — Cloudflare
          and Google are both certified participants — supplemented by standard
          contractual clauses where applicable.
        </p>
      </Section>

      <Section id="legal-bases" title="Our legal bases">
        <p>
          Where the GDPR or a similar law applies, the legal bases we rely on
          are:
        </p>
        <ul className="space-y-2 list-disc pl-5">
          <li>
            Performance of a contract — running the lookups you ask for, signing
            you in, rendering your heatmaps, and publishing a profile you have
            chosen to publish.
          </li>
          <li>
            Legitimate interests — the analytics and the hosting and service
            logs described above, in our interest in understanding how GitAll is
            used and keeping it secure and reliable. Where your local law
            requires consent for analytics, we rely on your consent instead.
          </li>
          <li>
            Legal obligation — where the law requires us to process or retain
            something.
          </li>
        </ul>
        <p>
          We do not use your data to make automated decisions that have legal or
          similarly significant effects on you.
        </p>
      </Section>

      <Section id="choices" title="Your choices">
        <ul className="space-y-2 list-disc pl-5">
          <li>
            Keep your profile private, or unpublish it, from your settings.
          </li>
          <li>
            Change your handle from your settings (limited to once every 7
            days).
          </li>
          <li>Disconnect a provider without deleting your account.</li>
          <li>
            Delete your account from your settings. This removes your profile
            and every connected account from our database and clears your
            session and token cookies. It cannot be undone. Signing in again
            afterwards creates a new, empty profile.
          </li>
          <li>Sign out to clear your cookies without deleting anything.</li>
        </ul>
        <p>
          To ask what data we hold, or to exercise your rights of access,
          correction, erasure, restriction, or portability, or to object to
          processing based on our legitimate interests, email{' '}
          <a
            href="mailto:support@toastbyte.studio"
            className="hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            support@toastbyte.studio
          </a>
          . Where we rely on your consent, you can withdraw it at any time. If
          you are in the European Economic Area or the United Kingdom, you also
          have the right to lodge a complaint with your data protection
          authority, though we would welcome the chance to resolve your concern
          first.
        </p>
        <p>
          One honest limitation: the analytics identifier described above is
          never linked to an account, so we cannot proactively find the GA4
          events that are yours. If you email us the IP address, browser
          user-agent string, and language setting you were using, we can
          recompute the identifier those details produce and ask Google to
          delete the data held against it. Without them, we have nothing to
          search by.
        </p>
        <p>
          We also cannot honestly point you at an ad blocker as a way to opt
          out. Where we ask for an analytics choice, declining is the effective
          route and it binds our servers as well as your browser — but blocking
          the analytics script by itself is not the same thing, and some events
          originate on our servers and never pass through your browser’s
          protections at all. An embed being served is the clearest example: as
          described above, that one is recorded regardless. Deleting the
          analytics cookies listed above resets the browser-path identifier, but
          does not affect the server-derived one.
        </p>
      </Section>

      <Section id="children" title="Children">
        <p>
          GitAll is not directed at children under 13 — or the higher age your
          local law sets for consenting to data processing — and we do not
          knowingly collect data from them. If you believe a child has given us
          personal data, email us and we will remove it.
        </p>
      </Section>

      <Section id="changes" title="Changes">
        <p>
          If we change this policy we will update the date at the top. Material
          changes will be noted on the site.
        </p>
      </Section>
    </main>
  );
}
