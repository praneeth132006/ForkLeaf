import React from "react";
import { GettingStarted, HowItWorks } from "./start";
import { Editor, Diagrams, Properties, Export, Shortcuts } from "./writing";
import { Reading } from "./reading";
import { CitationLinks } from "./citation-links";
import { Features } from "./features";
import { BrowserExtension, McpServer } from "./setup";
import {
  EncryptedNotes,
  Flashcards,
  Importing,
  Journal,
  Resurfacing,
  RunningCode,
  Saving,
  SlashMenu,
  Tasks,
  Views,
  VoiceNotes,
} from "./everyday";
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
  "citation-links": CitationLinks,
  shortcuts: Shortcuts,
  features: Features,
  "signing-in": SigningIn,
  repositories: Repositories,
  sync: Sync,
  conflicts: Conflicts,
  "browser-extension": BrowserExtension,
  mcp: McpServer,
  "slash-menu": SlashMenu,
  journal: Journal,
  tasks: Tasks,
  flashcards: Flashcards,
  views: Views,
  saving: Saving,
  "voice-notes": VoiceNotes,
  "encrypted-notes": EncryptedNotes,
  importing: Importing,
  "running-code": RunningCode,
  resurfacing: Resurfacing,
  plans: Plans,
  "privacy-and-data": PrivacyAndData,
  security: Security,
  troubleshooting: Troubleshooting,
  faq: Faq,
  support: Support,
};
