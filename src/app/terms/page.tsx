import Link from "next/link";
import { CONTACT_LINE, OPERATOR_LINE, OTHER_PEOPLE_STATEMENT, SCORE_ORIGIN, TERMS_EFFECTIVE_DATE, TERMS_VERSION } from "@/lib/strings";
import { muted, page } from "../ui";

// The Terms people accept on the "One quick thing" step. The version they accepted and the time are recorded (TERMS_VERSION in src/lib/strings.ts).
// Change the wording in a way people must accept again, and bump TERMS_VERSION.

export const metadata = { title: "Rare Tomato Terms" };

export default function Terms() {
  return (
    <main style={page}>
      <h1>Rare Tomato Terms</h1>
      <p style={muted}>
        Effective date: {TERMS_EFFECTIVE_DATE}. Version {TERMS_VERSION}. {OPERATOR_LINE}
      </p>

      <h2>1. Agreement and eligibility</h2>
      <p>
        You must be 18 or older. You accept these Terms by ticking the box when you sign up. The <Link href="/privacy">Privacy Notice</Link> explains how we handle information.
        Rare Tomato is run from the United States.
      </p>

      <h2>2. What the service does</h2>
      <p>
        Rare Tomato stores details and the rules you save, makes the information you permit available to the agents you connect, shows task reports, and provides rule
        suggestions and comparisons. Agents may ignore your rules. Reports and comparisons can be inaccurate. {SCORE_ORIGIN} Rare Tomato does not execute, authorize, block or
        reverse an agent&apos;s actions, and saving a rule is not approving a purchase, message, booking or other transaction.
      </p>

      <h2>3. Accounts and agent connections</h2>
      <p>
        Keep your access secure and review permissions before you connect an agent. Tell support@raretomato.ai if you suspect unauthorized access. You can change or remove
        agents on Connected Agents. Disconnecting an agent stops its future access through Rare Tomato but cannot recall information it already received. Other providers&apos; terms
        govern their own services.
      </p>

      <h2>4. Your content</h2>
      <p>
        You keep your rights in what you add. You give us a non-exclusive permission to host, process, reproduce and disclose it only as needed to provide the features you ask
        for, to secure and support the service and to comply with law, consistent with the Privacy Notice. We do not own your personal information, we do not publish it, and we
        do not use it for unrelated advertising. Our permission ends when you delete the content, except for the limited retention the Privacy Notice describes. You must have
        permission or legal authority to submit information about someone else, including parental or guardian authority for a child.
      </p>

      <h2>5. Acceptable use</h2>
      <p>
        Do not enter government ID numbers, card or bank details, passwords, insurance or medical record IDs, test results or clinical documents. {OTHER_PEOPLE_STATEMENT} Do not
        use the service unlawfully, access someone else&apos;s account, bypass access controls, introduce malicious code, interfere with the service, or use it to harass or
        watch another person.
      </p>

      <h2>6. Provided as is</h2>
      <p>
        Rare Tomato is free. It may change, stop or lose data, so export what you want to keep. It is not for emergency response or medical decisions. Check consequential agent
        actions directly with the provider. Nothing here reduces rights that the law does not allow us to limit.
      </p>

      <h2>7. Suspension, closure and changes</h2>
      <p>
        You can stop using Rare Tomato and delete your account on Settings and data. We may restrict access for security threats, unlawful use or material violations, and will
        explain where practicable. If the project closes, we will give reasonable notice and a chance to export where practicable. For material changes to these Terms you will be
        asked to accept the new version.
      </p>

      <h2>8. Warranties and responsibility</h2>
      <p>
        Rare Tomato is provided as available. We do not guarantee an agent&apos;s performance or that an agent follows your rules. We remain responsible for our own conduct as the
        law requires, and nothing here excludes liability that cannot lawfully be excluded.
      </p>

      <h2>9. Contact</h2>
      <p>{CONTACT_LINE}</p>
    </main>
  );
}
