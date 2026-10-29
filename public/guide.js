import { heading } from './ui.js';

export function guide(ctx) {
  ctx.main.innerHTML = `<article class="prose field-guide">${heading('From interesting to useful.', 'An Amani field guide to choosing open source with evidence—not just a crowded star counter.', 'THE AMANI FIELD GUIDE')}
    <p>A trending list answers one narrow question: what is attracting attention right now? It does not tell you whether a project solves your problem, whether its license fits your plans, or what it will cost to operate. Use discovery as the start of a decision, not the decision itself.</p>
    <h2>1. Write down the job before choosing the tool</h2>
    <p>Describe a small outcome you need: process one sample file, automate one repeated step, or serve one representative request. Note constraints such as your operating system, preferred language, available memory and deployment environment. A project outside those constraints needs a clear advantage to justify the integration work.</p>
    <h2>2. Separate attention from evidence</h2>
    <p>Total stars reflect accumulated attention. A daily gain is a short-window signal, not a reliability score. Forks can represent active development, experiments or abandoned copies. None of these numbers proves security, maintainability or fitness for production.</p>
    <p>Amani labels GitHub-reported period gains separately from observed historical change. Missing observations remain missing. Before drawing a conclusion from a chart, check the dates and remember that a new collection may not yet contain a long-term trend.</p>
    <h2>3. Put your alternatives on one workbench</h2>
    <p>Save a few plausible projects, then open <a data-nav href="/workbench">your workbench</a>. Compare language, license, repository updates and project scope before comparing popularity. The tool deliberately does not declare a winner: the most useful project is the one that meets your constraints with the least unnecessary work.</p>
    <p>You can share a comparison link with a teammate. It contains selected public repository names, not your browsing history. Saved projects remain in your browser; clearing its local storage clears your shortlist.</p>
    <h2>4. Inspect the project where it actually lives</h2>
    <p>Open the repository on GitHub. Read its current license and installation instructions. Look for recent releases, maintenance guidance, supported versions and security-reporting instructions. Read a few recent issues: the important question is whether your likely problems are acknowledged and understood, not whether the issue count is zero.</p>
    <p>An “updated” timestamp can come from many kinds of changes. It is not a promise of support. An archived flag deserves attention, but an unarchived repository is not automatically maintained. Verify these details at the source before depending on the project.</p>
    <h2>5. Run a small, reversible trial</h2>
    <p>Use disposable data and a restricted environment. Do not paste credentials into an unfamiliar setup script. Try your representative task, record the steps and note the dependencies it adds. Check whether you can remove the tool and recover your data without a complicated migration.</p>
    <p>For a serious dependency, include installation time, ongoing updates, resource use, operational failure modes and the license obligations you need to understand. A short trial that rules a tool out can save more time than a long comparison based on stars alone.</p>
    <h2>6. Make your decision explainable</h2>
    <p>Keep a short decision note: the task, alternatives, reasons for the choice, remaining risks and the next review date. Link to the version and documentation you evaluated. That note is more durable than a ranking that changes tomorrow.</p>
    <div class="notice"><strong>How Amani stays honest:</strong> we publish public-source observations, keep timestamps visible, and do not sell rankings or turn missing history into invented scores. There are currently no ads, affiliate links or sponsored placements. If that changes, commercial content must be clearly labeled and separate from the evidence.</div>
    <p><a class="button button-dark" data-nav href="/github-trending">Find a project to evaluate ↗</a></p>
  </article>`;
}
