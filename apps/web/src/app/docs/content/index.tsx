import React from "react";
import { GettingStarted, HowItWorks } from "./start";
import { Editor, Diagrams, Properties, Export, Shortcuts } from "./writing";
import { Reading } from "./reading";
import { Features } from "./features";
import { SigningIn, Repositories, Sync, Conflicts } from "./github";
import { Plans, PrivacyAndData, Security } from "./account";
import { Troubleshooting, Faq, Support } from "./running";

/**
 * Slug → article body.
 *
 * Hand-written TSX rather than MDX: every element is a real styled component,
 * the content typechecks alongside the code it describes, and adding a page
 * needs no build-pipeline changes. The table of contents lives in `../nav.ts`,
 * and a slug present in one and absent from the other is a build error.
 */
export const DOC_CONTENT: Record<string, () => React.JSX.Element> = {
  "getting-started": GettingStarted,
  "how-it-works": HowItWorks,
  editor: Editor,
  diagrams: Diagrams,
  properties: Properties,
  export: Export,
  reading: Reading,
  shortcuts: Shortcuts,
  features: Features,
  "signing-in": SigningIn,
  repositories: Repositories,
  sync: Sync,
  conflicts: Conflicts,
  plans: Plans,
  "privacy-and-data": PrivacyAndData,
  security: Security,
  troubleshooting: Troubleshooting,
  faq: Faq,
  support: Support,
};
