import { SiteShell } from "@/components/SiteShell";
import { A, H2, Lead, LI, Note, P, UL } from "@/components/prose";
import { LegalPage, CONTACT_EMAIL } from "@/components/LegalPage";

export const metadata = {
  title: "Terms & Conditions",
  description:
    "The terms for using ForkLeaf: what the service is, what you are responsible for, and the limits of our liability.",
};

export default function TermsPage() {
  return (
    <SiteShell>
      <LegalPage title="Terms & Conditions">
        <Lead>
          These terms cover the hosted ForkLeaf service. By using it you agree to them. If you do
          not, please do not use the service — the source is open, and you are free to run your own
          copy instead.
        </Lead>

        <Note>
          <strong>The short version.</strong> ForkLeaf is free software provided as-is. Your notes
          are yours and live in your own GitHub account. Do not use the service to break the law or
          to attack it. We can change or discontinue the hosted service, and if we do, your notes
          keep working without it.
        </Note>

        <H2 id="service">1. What ForkLeaf is</H2>
        <P>
          ForkLeaf is a Markdown editor that reads and writes files in a GitHub repository you
          control. It stores a working copy in your browser and commits changes to that repository
          on your behalf. It is not a storage provider, and it is not a backup service — GitHub
          holds your files, under GitHub&rsquo;s own terms.
        </P>

        <H2 id="eligibility">2. Who may use it</H2>
        <P>
          You must be at least 13 years old and able to form a binding contract. Connecting a GitHub
          account requires a GitHub account in good standing; you must comply with{" "}
          <A href="https://docs.github.com/site-policy/github-terms/github-terms-of-service">
            GitHub&rsquo;s Terms of Service
          </A>{" "}
          as well as these.
        </P>

        <H2 id="account">3. Your account and access</H2>
        <UL>
          <LI>
            You are responsible for everything done through your account, and for keeping access to
            your GitHub account secure.
          </LI>
          <LI>
            Authorising ForkLeaf grants it permission to read and write repositories in your
            account. You can revoke that at any time at{" "}
            <A href="https://github.com/settings/applications">
              GitHub → Settings → Applications → Authorized OAuth Apps
            </A>
            . Revoking immediately stops all access.
          </LI>
          <LI>
            You may use ForkLeaf without an account at all. Notes written that way are stored only
            in your browser and are not backed up by anyone.
          </LI>
        </UL>

        <H2 id="your-content">4. Your content</H2>
        <P>
          <strong>You own everything you write.</strong> We claim no licence over your notes, no
          right to display them, and no right to use them to train anything. We could not do so if
          we wanted to — we do not store them.
        </P>
        <P>
          You are responsible for the legality of what you write and for having the rights to it.
          You are also responsible for your repository&rsquo;s visibility settings: if you make a
          notes repository public, or connect a public one, your notes are public and ForkLeaf
          cannot prevent that.
        </P>

        <H2 id="acceptable">5. Acceptable use</H2>
        <P>You agree not to:</P>
        <UL>
          <LI>Use the service to store or distribute unlawful material.</LI>
          <LI>
            Attempt to gain unauthorised access to the service, other users&rsquo; data, or the
            underlying infrastructure.
          </LI>
          <LI>
            Interfere with the service — denial-of-service attempts, deliberate abuse of the GitHub
            API through it, or automated traffic that degrades it for others.
          </LI>
          <LI>Use it to infringe anyone&rsquo;s intellectual property or privacy.</LI>
          <LI>Remove or obscure attribution or licence notices in the software.</LI>
        </UL>
        <P>
          Security research is welcome. Please follow the disclosure process in{" "}
          <A href="https://github.com/praneeth132006/ForkLeaf/blob/main/SECURITY.md">SECURITY.md</A>{" "}
          rather than testing destructively against the hosted service.
        </P>

        <H2 id="software">6. The software licence</H2>
        <P>
          ForkLeaf&rsquo;s source is licensed under the{" "}
          <A href="https://github.com/praneeth132006/ForkLeaf/blob/main/LICENSE">
            Apache License 2.0
          </A>
          . That licence governs your rights to the code — to use, modify, distribute and self-host
          it. These terms govern the hosted service only, and nothing here restricts the rights the
          Apache licence grants you.
        </P>

        <H2 id="paid">7. What it costs</H2>
        <P>
          <strong>Nothing, and there are no tiers.</strong> There is no checkout, no card on file
          and no plan attached to your account — the codebase contains no billing collection and no
          payment integration. Funding comes from optional sponsorship, which unlocks nothing.
        </P>
        <P>
          Should that ever change, prices and billing terms would be published before any charge was
          made and these terms updated to cover them. The commitments about what stays free are set
          out in <A href="/docs/plans">the documentation</A>.
        </P>

        <H2 id="availability">8. Availability and changes</H2>
        <P>
          The hosted service is provided on a best-efforts basis with no uptime guarantee. We may
          change, suspend or discontinue it, in whole or in part, at any time.
        </P>
        <Note>
          If the hosted service disappears, your notes do not. They are already plain Markdown files
          in a git repository in your own GitHub account, and they keep working with any other
          editor — or with a self-hosted ForkLeaf. This is the deliberate consequence of the
          architecture, not a promise we could later withdraw.
        </Note>

        <H2 id="third-party">9. Third-party services</H2>
        <P>
          ForkLeaf depends on GitHub for storage and authentication, and on Google Firebase for
          analytics and account records. Those services have their own terms and privacy policies,
          and we are not responsible for their acts, omissions or availability.
        </P>

        <H2 id="warranty">10. Disclaimer of warranties</H2>
        <P>
          The service and the software are provided <strong>&ldquo;as is&rdquo;</strong> and{" "}
          <strong>&ldquo;as available&rdquo;</strong>, without warranties of any kind, express or
          implied, including merchantability, fitness for a particular purpose, and
          non-infringement. We do not warrant that the service will be uninterrupted, error-free, or
          that data will never be lost.
        </P>
        <P>
          Keep your own backups. A git repository you can clone is a good one, and you already have
          it.
        </P>

        <H2 id="liability">11. Limitation of liability</H2>
        <P>
          To the fullest extent permitted by law, we are not liable for any indirect, incidental,
          special, consequential or punitive damages, nor for any loss of data, profits, revenue or
          goodwill, arising out of your use of the service.
        </P>
        <P>
          Where liability cannot be excluded, our total aggregate liability is limited to the
          greater of the amount you paid us in the preceding twelve months — currently zero — or USD
          50.
        </P>
        <P>
          Nothing in these terms excludes liability for death or personal injury caused by
          negligence, for fraud, or for anything else that cannot lawfully be excluded.
        </P>

        <H2 id="indemnity">12. Indemnity</H2>
        <P>
          You agree to indemnify us against claims arising from your use of the service in breach of
          these terms or in violation of any law or third-party right.
        </P>

        <H2 id="termination">13. Termination</H2>
        <P>
          You may stop using ForkLeaf at any time by revoking its GitHub access. We may suspend or
          terminate access if you materially breach these terms, particularly section 5.
        </P>
        <P>
          Termination does not touch your repository. Your notes remain in your GitHub account,
          unaffected.
        </P>

        <H2 id="law">14. Governing law</H2>
        <P>
          These terms are governed by the laws of India, and the courts of India have exclusive
          jurisdiction — save that if you are a consumer resident elsewhere, you keep the benefit of
          any mandatory protections of your local law.
        </P>

        <H2 id="changes">15. Changes to these terms</H2>
        <P>
          We may update these terms. The date at the top changes, and material changes are announced
          in the app. Every revision is public in the{" "}
          <A href="https://github.com/praneeth132006/ForkLeaf">git repository</A>, so you can diff
          them. Continuing to use the service after a change means you accept it.
        </P>

        <H2 id="contact">16. Contact</H2>
        <P>
          Questions about these terms: <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>. See
          also the <A href="/privacy">Privacy Policy</A>.
        </P>

        <H2 id="not-advice">17. A note on these terms</H2>
        <P>
          ForkLeaf is an open-source project, not a law firm. These terms are written to be honest
          and readable rather than exhaustive, and they are not legal advice. If you need certainty
          for a commercial deployment, run your own instance under the Apache licence, where you set
          the terms.
        </P>
      </LegalPage>
    </SiteShell>
  );
}
