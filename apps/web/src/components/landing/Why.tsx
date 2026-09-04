import { SectionHeading } from "./SectionHeading";
import { PositioningBlock } from "./Positioning";
import { ComparisonBlock } from "./Comparison";

/**
 * Why this rather than the thing you already use.
 *
 * One question, and until now it was asked twice. `Positioning` compared
 * categories — a hosted app, a local folder, editing on github.com — and
 * `Comparison` compared named products, each as a full section with its own
 * eyebrow, its own display heading and its own summing-up. A reader met the
 * same argument twice in two voices and had no way to tell whether the second
 * one was making a new point.
 *
 * It is one section now, with one heading and two blocks under it: by
 * category, then by name. Nothing was cut — both tables, both sets of
 * closing arguments and the audiences list are all still here — but the page
 * stops restating its own premise, and the reader is told once that this is
 * the honest-comparison part.
 *
 * Both anchors still land: `#why` is this section, and `#compare` is on the
 * table itself, which is what the nav has always meant by it.
 */
export function Why() {
  return (
    <section id="why" className="fl-anchor mx-auto w-full max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="Where this fits"
        title="Every other notes app is a rented room. This one is a deed."
        body="You already have somewhere to put notes, so here is the honest case for moving — first against the categories, then against the products by name."
      />

      <PositioningBlock />
      <ComparisonBlock />
    </section>
  );
}
