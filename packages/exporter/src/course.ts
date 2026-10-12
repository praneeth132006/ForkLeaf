import { escapeHtml } from "./html";

/**
 * A book published as a course.
 *
 * The same pages, with three things a course has and a book does not: a
 * "Mark this lesson done" button and a progress bar on every lesson, ticks on
 * the contents page, and a quiz at the end made from the folder's flashcards.
 *
 * Progress lives in each visitor's own browser (localStorage) — the site is
 * static files on GitHub Pages, there is no server to keep it on, and a
 * reader's progress through somebody else's course is nobody else's business.
 * Everything still works with scripts off: the lessons are ordinary pages, and
 * the quiz's answers are a click away in a details element.
 */

export interface CourseQuizCard {
  question: string;
  answer: string;
  /** The note the card is in, so a miss can point at its lesson. */
  notePath: string;
}

export interface CourseOptions {
  /** Keys this course's progress in the visitor's browser; stable across republishes. */
  key: string;
  quiz: readonly CourseQuizCard[];
}

/** The quiz page's filename stem, reserved like the contents page's. */
export const QUIZ = "quiz";

/** JSON safe to put inside a <script> element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function courseConfig(key: string, lessons: readonly string[]): string {
  return `<script type="application/json" id="course-config">${scriptJson({ key, lessons })}</script>`;
}

/** The bar under a lesson's title: progress through the course, and the button to tick this one off. */
export function lessonBar(slug: string): string {
  return `<div class="course-bar" data-course-lesson="${escapeHtml(slug)}">
  <div class="course-progress" aria-hidden="true"><span class="course-progress-fill"></span></div>
  <span class="course-progress-label" aria-live="polite"></span>
  <button class="course-done" type="button" data-lesson="${escapeHtml(slug)}" aria-pressed="false">Mark this lesson done</button>
</div>`;
}

/** Above the contents: how far through the course this visitor is, and the way to the quiz. */
export function coverBar(hasQuiz: boolean): string {
  return `<div class="course-bar course-bar-cover">
  <div class="course-progress" aria-hidden="true"><span class="course-progress-fill"></span></div>
  <span class="course-progress-label" aria-live="polite"></span>
  ${hasQuiz ? `<a class="course-quiz-link" href="${QUIZ}.html">Take the quiz →</a>` : ""}
</div>`;
}

/** The quiz: every card's question, its answer behind a click, and a score. */
export function quizBody(
  cards: ReadonlyArray<CourseQuizCard & { lesson: { slug: string; title: string } | null }>,
): string {
  const items = cards
    .map(
      (
        card,
        index,
      ) => `  <li class="quiz-card"${card.lesson ? ` data-lesson="${escapeHtml(card.lesson.slug)}" data-lesson-title="${escapeHtml(card.lesson.title)}"` : ""}>
    <p class="quiz-q"><span class="quiz-n">${index + 1}.</span> ${escapeHtml(card.question)}</p>
    <details class="quiz-a">
      <summary>Show the answer</summary>
      <p>${escapeHtml(card.answer)}</p>
      <p class="quiz-grade" hidden>
        <button type="button" data-grade="1">I knew it</button>
        <button type="button" data-grade="0">I didn't</button>
      </p>
    </details>
  </li>`,
    )
    .join("\n");

  return `<p class="quiz-intro">${cards.length} question${cards.length === 1 ? "" : "s"} from the lessons. Answer each in your head, then check.</p>
<ol class="course-quiz">
${items}
</ol>
<section class="quiz-result" hidden aria-live="polite">
  <h2 class="quiz-score"></h2>
  <div class="quiz-revisit"></div>
  <p><button type="button" class="quiz-again">Try again</button></p>
</section>`;
}

/**
 * The script every course page carries. Small, dependency-free, ES5, and
 * defensive about storage: a browser that refuses localStorage gets a course
 * that forgets on reload, not one that breaks.
 */
export const COURSE_SCRIPT = `(function () {
  var configElement = document.getElementById("course-config");
  if (!configElement) return;
  var config = JSON.parse(configElement.textContent || "{}");
  var key = "forkleaf-course:" + config.key;
  var done = [];
  try { done = JSON.parse(window.localStorage.getItem(key) || "[]") || []; } catch (e) { done = []; }
  function save() { try { window.localStorage.setItem(key, JSON.stringify(done)); } catch (e) {} }
  function has(slug) { return done.indexOf(slug) !== -1; }
  function each(selector, fn) { var list = document.querySelectorAll(selector); for (var i = 0; i < list.length; i++) fn(list[i]); }

  function paint() {
    var count = 0;
    for (var i = 0; i < config.lessons.length; i++) if (has(config.lessons[i])) count++;
    var total = config.lessons.length || 1;
    each(".course-progress-fill", function (el) { el.style.width = Math.round((count / total) * 100) + "%"; });
    each(".course-progress-label", function (el) {
      el.textContent = count === total ? "Course complete — every lesson done" : count + " of " + config.lessons.length + " lessons done";
    });
    each("[data-toc-lesson]", function (el) { el.classList.toggle("is-done", has(el.getAttribute("data-toc-lesson"))); });
    each(".course-done", function (el) {
      var on = has(el.getAttribute("data-lesson"));
      el.setAttribute("aria-pressed", on ? "true" : "false");
      el.textContent = on ? "Done ✓ — undo" : "Mark this lesson done";
    });
  }

  each(".course-done", function (button) {
    button.addEventListener("click", function () {
      var slug = button.getAttribute("data-lesson");
      var at = done.indexOf(slug);
      if (at === -1) done.push(slug); else done.splice(at, 1);
      save();
      paint();
    });
  });
  paint();

  var quiz = document.querySelector(".course-quiz");
  if (!quiz) return;
  var cards = quiz.querySelectorAll(".quiz-card");
  var result = document.querySelector(".quiz-result");
  var grades = {};

  function finish() {
    var known = 0, total = cards.length, missed = [];
    for (var i = 0; i < total; i++) {
      if (grades[i] === 1) known++;
      else {
        var slug = cards[i].getAttribute("data-lesson");
        var title = cards[i].getAttribute("data-lesson-title");
        if (slug && missed.indexOf(slug + "\\u0000" + title) === -1) missed.push(slug + "\\u0000" + title);
      }
    }
    result.querySelector(".quiz-score").textContent = "You knew " + known + " of " + total;
    var revisit = result.querySelector(".quiz-revisit");
    revisit.innerHTML = "";
    if (missed.length) {
      var heading = document.createElement("p");
      heading.textContent = "Lessons to go over again:";
      var list = document.createElement("ul");
      for (var j = 0; j < missed.length; j++) {
        var parts = missed[j].split("\\u0000");
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.href = parts[0] + ".html";
        link.textContent = parts[1];
        item.appendChild(link);
        list.appendChild(item);
      }
      revisit.appendChild(heading);
      revisit.appendChild(list);
    }
    result.hidden = false;
  }

  for (var i = 0; i < cards.length; i++) (function (index) {
    var card = cards[index];
    var details = card.querySelector("details");
    var grade = card.querySelector(".quiz-grade");
    details.addEventListener("toggle", function () { if (details.open) grade.hidden = false; });
    var buttons = grade.querySelectorAll("button");
    for (var b = 0; b < buttons.length; b++) buttons[b].addEventListener("click", function (event) {
      grades[index] = Number(event.currentTarget.getAttribute("data-grade"));
      card.classList.toggle("is-known", grades[index] === 1);
      card.classList.toggle("is-missed", grades[index] === 0);
      var graded = 0;
      for (var k in grades) if (Object.prototype.hasOwnProperty.call(grades, k)) graded++;
      if (graded === cards.length) finish();
    });
  })(i);

  result.querySelector(".quiz-again").addEventListener("click", function () {
    grades = {};
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.remove("is-known", "is-missed");
      cards[i].querySelector("details").open = false;
      cards[i].querySelector(".quiz-grade").hidden = true;
    }
    result.hidden = true;
    window.scrollTo(0, 0);
  });
})();`;

export const COURSE_STYLES = `
/* ── Course ── */
.course-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; margin: 0 0 2rem; padding: .75rem 1rem; border: 1px solid var(--rule); border-radius: 12px; }
.course-progress { flex: 1 1 10rem; height: 6px; border-radius: 999px; background: var(--rule); overflow: hidden; }
.course-progress-fill { display: block; height: 100%; width: 0; background: var(--accent); transition: width .2s ease; }
.course-progress-label { font-size: .8125rem; color: var(--muted); }
.course-done, .quiz-grade button, .quiz-again { font: inherit; font-size: .875rem; font-weight: 600; padding: .4rem .8rem; border-radius: 8px; border: 1px solid var(--rule); background: transparent; color: var(--fg); cursor: pointer; }
.course-done[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
.course-quiz-link { font-weight: 600; color: var(--accent); text-decoration: none; }
.course-bar-cover { margin-top: 2rem; }
.book-toc li.is-done .book-toc-title::after { content: " ✓"; color: var(--accent); }
.course-quiz { list-style: none; margin: 1.5rem 0; padding: 0; }
.quiz-card { padding: 1rem 0; border-top: 1px solid var(--rule); }
.quiz-card.is-known .quiz-n { color: var(--accent); }
.quiz-card.is-missed .quiz-n { color: #c2372d; }
.quiz-q { margin: 0 0 .5rem; font-weight: 600; }
.quiz-a summary { cursor: pointer; color: var(--accent); font-size: .9375rem; }
.quiz-grade { display: flex; gap: .5rem; }
.quiz-result { margin-top: 2rem; padding: 1.25rem; border: 1px solid var(--rule); border-radius: 12px; }
`;
