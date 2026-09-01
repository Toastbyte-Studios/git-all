import type { Metadata } from 'next';
import type React from 'react';

// Every factual claim on this page was written against the code as it actually
// behaves, not from a boilerplate template. If you change any of the following,
// re-read this page and update it in the same PR:
//
//   src/lib/auth-session.ts          cookie names, contents, lifetimes
//   src/lib/auth-cookies.ts          what sign-out / deletion clears
//   src/lib/profiles.ts              what D1 stores; the public projection
//   src/lib/analytics-server.ts      the GA4 client_id derivation; the
//                                    server-side consent gate
//   src/lib/analytics-client.ts      the Zaraz / server-fallback split; the
//                                    Zaraz consent bridge
//   src/lib/analytics-consent.ts     cookie name, lifetime, SameSite, and the
//                                    CONSENT_EXEMPT_EVENTS set that decides
//                                    which events ignore the banner
//   src/components/AnalyticsConsentBanner.tsx   what the banner actually says
//   src/app/embed/[slug]/route.ts    what an embed impression records
//   migrations/                      the columns described under "On our servers"
//
// The retention figures below are read from the GA4 property, not from code.
// If anyone changes them in GA4 Admin → Data collection and modification →
// Data retention, they must be changed here too.
//
// Four claims were verified against things outside this file. Re-verify them
// when reviewing this page:
//
//   Zaraz GA4 cookies                re-read from a live browser 2026-09-01:
//                                    cfz_google-analytics_v4 (expiry ~1 year)
//                                    and cfzs_google-analytics_v4 (session),
//                                    both HttpOnly, Secure, Lax. cf_clearance
//                                    (under "Hosting and service logs") was
//                                    observed in the same session, expiry
//                                    ~1 year. Re-verify if the Zaraz tool
//                                    config changes.
//   zaraz-consent cookie             read 2026-09-01: name is `zaraz-consent`,
//                                    NOT the `cf_consent` in Cloudflare's
//                                    docs. Not HttpOnly, SameSite=Strict,
//                                    expiry ~1 year. The name is configurable
//                                    per zone — re-check it rather than
//                                    trusting the documentation.
//   trackClientEvent call sites      audited 2026-08-04: lookupRun
//                                    (authenticated, entry_count,
//                                    includes_gitea), timeRangeSelected
//                                    (period preset, mode), integratedViewUsed
//                                    (entry_count), embedGenerated
//                                    (snippet_type, platform_count). No
//                                    usernames, no custom dates. The example
//                                    list under "Analytics" reflects this
//                                    inventory — re-audit if events or their
//                                    params change. NOTE: this audit predates
//                                    the consent work and is due a re-run.
//   dataprivacyframework.gov         Cloudflare's and Google's certifications,
//                                    cited under "Where your data is
//                                    processed". Verified active 2026-08-03.
//
// One asymmetry is deliberate and must not be quietly smoothed over: the
// embed impression is in CONSENT_EXEMPT_EVENTS, so declining on gitall.app
// does NOT stop it. That is stated outright under "Embedded heatmaps" and in
// "Our legal bases". If the exemption is ever removed, remove those
// paragraphs too — an over-cautious policy is still a wrong one.
//
// A privacy policy that has drifted from the code is worse than no policy.

export const metadata: Metadata = {
  title: 'Privacy Policy — GitAll',
  description:
    'How GitAll handles your data: what we store, what we send to analytics, and how to delete your account.',
  alternates: { canonical: 'https://gitall.app/privacy' },
};

// Bumped from August 4, 2026 because the legal basis for Google Analytics
// changed from legitimate interests to consent. That is a material change, not
// a wording fix, so the effective date moves rather than only the update date.
const EFFECTIVE_DATE = 'September 1, 2026';
const LAST_UPDATED = 'September 1, 2026';
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
        Effective {EFFECTIVE_DATE} · Last updated {LAST_UPDATED}
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
          cookies used for analytics, for recording your consent choice, and for
          security are described under “Analytics” and “Hosting and service
          logs” below.
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
          Your choice
        </h3>
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>
            Google Analytics does not run until you allow it.
          </strong>{' '}
          The first time you visit, a banner asks. Until you accept, no Google
          Analytics cookie is set and nothing is sent to Google. Declining is
          recorded and respected, and the site works exactly the same either
          way.
        </p>
        <p>
          You can change your mind at any time from the “Cookie preferences”
          link in the footer of any page. Withdrawing consent stops any further
          events; it does not by itself delete what was already collected — see
          “Your choices” below for what we can and cannot do about that.
        </p>
        <p>
          Your choice applies to both of the delivery paths described below, the
          one that runs in your browser and the one that runs on our servers.
          There is one exception, and it is a real one rather than a
          technicality: the embedded-heatmap impression described at the end of
          this section. That request reaches us from a page on someone else’s
          site, where your choice is not readable. It is spelled out there.
        </p>

        <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          Cloudflare Web Analytics
        </h3>
        <p>
          Every page load is counted by Cloudflare Web Analytics. It sets no
          cookies, uses no client-side state, and does not track you across
          sites. Because it stores nothing on your device and cannot single you
          out, it is not covered by the consent banner and continues whichever
          way you answer.
        </p>

        <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          Google Analytics 4
        </h3>
        <p>
          Once you have accepted, we send a small set of product events to
          Google Analytics 4 — things like a lookup being run, a sign-in
          completing, or a profile being viewed. Events reach GA4 either from
          your browser through Cloudflare Zaraz, which serves the analytics
          script from our own domain, or from our servers via the GA4
          Measurement Protocol. On the browser path, Zaraz manages the Google
          Analytics identifier on our behalf, using the cookies listed below.
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
          Analytics cookies
        </h3>
        <p>
          If you accept, the browser path sets cookies. Zaraz creates two
          first-party cookies on gitall.app for Google Analytics:
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
          for gitall.app alone — they do not follow you to other sites. Neither
          exists before you accept, and declining prevents both.
        </p>

        <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          Consent cookies
        </h3>
        <p>
          Remembering your answer requires storing it. Two cookies do that, and
          they are set whichever way you answer:
        </p>
        <ul className="space-y-2 list-disc pl-5">
          <li>
            <code>analytics-consent</code> — the word “granted” or the word
            “denied”, and nothing else. No identifier. Our own code reads it,
            including on our servers, which is why it is a cookie rather than
            browser storage. Kept for one year, sent only over HTTPS, marked
            SameSite=Lax, and readable by scripts on gitall.app so that the
            banner can tell whether to appear.
          </li>
          <li>
            <code>zaraz-consent</code> — Cloudflare Zaraz’s own record of the
            same decision. This is the one that actually stops the Google
            Analytics tag from loading. Kept for about a year and marked
            SameSite=Strict.
          </li>
        </ul>
        <p>
          Both are strictly necessary: without them we could not remember that
          you said no, and would have to ask again on every page.
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
          <strong style={{ color: 'var(--text-primary)' }}>
            This is the one thing your consent choice does not reach.
          </strong>{' '}
          The request arrives from a page on someone else’s site, so there is no
          gitall.app cookie for us to read — we cannot tell whether the person
          loading the image has ever answered our banner, or ever visited us at
          all. Declining analytics on gitall.app therefore does not stop these
          impressions being counted.
        </p>
        <p>
          On GitHub specifically, the image is fetched by GitHub’s own proxy
          rather than by your browser, so the address we see and hash is
          GitHub’s, not yours. On a personal site with a direct image tag, it is
          your browser and your address. The identifier is not linked to any
          account, ours or anyone else’s. If this matters to you, the only
          reliable avoidance is not to load pages that contain our embeds.
        </p>
      </Section>

      <Section id="local-storage" title="Data stored locally in your browser">
        <p>
          GitAll keeps a few preferences in your browser’s local storage: your
          theme, your contribution view mode, and your selected time range. They
          are tied to no account, and clearing your browser data removes them.
        </p>
        <p>
          Your analytics consent choice is deliberately <em>not</em> kept here.
          It lives in the <code>analytics-consent</code> cookie described above,
          because our servers have to be able to read it — local storage is
          visible only to your browser, so a choice recorded there could not
          stop the events our servers send.
        </p>
        <p>
          Our servers never read this storage. Acting on a preference can,
          however, fire one of the analytics events described above that names
          the choice — selecting a time-range preset is an example — so the
          choice itself may be counted, if you have accepted analytics, even
          though the stored value is not read.
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
            Consent — Google Analytics. Nothing reaches Google, from your
            browser or from our servers, unless you have accepted, and you can
            withdraw at any time from the footer of any page. We ask everyone
            rather than only visitors in places whose law requires it.
          </li>
          <li>
            Legitimate interests — Cloudflare Web Analytics, the hosting and
            service logs described above, and the embedded-heatmap impression,
            in our interest in understanding how GitAll is used and keeping it
            secure and reliable. The first two store nothing on your device. The
            third is the exception described under “Embedded heatmaps”: it
            reaches us from a third-party page where no choice of yours is
            readable, so there is no consent for us to act on and we rely on our
            interest in knowing whether the embed feature is used at all.
          </li>
          <li>
            Legal obligation — where the law requires us to process or retain
            something.
          </li>
        </ul>
        <p>
          Strictly-necessary cookies — the sign-in cookies, the two consent
          cookies, and Cloudflare’s security cookie — are not gated behind the
          banner. Asking permission to remember that you refused permission
          would be circular, and gating sign-in would break a feature you
          explicitly asked for.
        </p>
        <p>
          We do not use your data to make automated decisions that have legal or
          similarly significant effects on you.
        </p>
      </Section>

      <Section id="choices" title="Your choices">
        <ul className="space-y-2 list-disc pl-5">
          <li>
            Accept or decline analytics when the banner appears, and change your
            answer at any time from the “Cookie preferences” link in the footer.
          </li>
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
          . Where we rely on your consent, you can withdraw it at any time, and
          withdrawing does not affect the lawfulness of what we did while it was
          given. If you are in the European Economic Area or the United Kingdom,
          you also have the right to lodge a complaint with your data protection
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
          An ad blocker is not a reliable way to opt out, and blocking the
          analytics script in particular achieves nothing either way: both the
          browser path and our server-side path check the same recorded choice,
          so declining is the route that actually works. Deleting the analytics
          cookies listed above resets the browser-path identifier but does not
          affect the server-derived one, and it will also clear your recorded
          choice, so the banner will ask again. The embedded-heatmap impression
          remains outside all of this, as described above.
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
        <p>
          The change on {EFFECTIVE_DATE} was one: Google Analytics now runs only
          with your consent, asked for through a banner, where previously we
          relied on our legitimate interests except where local law required
          otherwise.
        </p>
      </Section>
    </main>
  );
}
