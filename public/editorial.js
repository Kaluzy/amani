// Original Amani decision notes. Source links reviewed 2026-11-02; not installation tests.
export const reviewed = '2026-11-02';
export const projectNotes = {
  'louislam/uptime-kuma': {
    role: 'Service monitoring', setup: 'Container or Node.js service', effort: 'Moderate',
    fit: 'Track whether your own services respond, before adding more infrastructure.',
    caution: 'A monitor on the same failed server cannot warn you reliably. Separate monitoring from the service it watches.',
    experiment: 'Monitor one non-critical endpoint and deliberately stop it to test a notification.',
  },
  'coollabsio/coolify': {
    role: 'Self-hosted deployment platform', setup: 'Server administration and containers', effort: 'Advanced',
    fit: 'Bring application deployment and service management onto infrastructure you operate.',
    caution: 'Convenient deployment does not remove responsibility for patches, credentials, backups and recovery.',
    experiment: 'Deploy a disposable application, then practise restoring it before migrating anything important.',
  },
  'n8n-io/n8n': {
    role: 'Workflow automation', setup: 'Self-hosted service or hosted option', effort: 'Moderate',
    fit: 'Connect repetitive tasks into a visible workflow rather than maintaining many small scripts.',
    caution: 'This is fair-code/source-available software. Review its Sustainable Use and Enterprise terms for your intended business use.',
    experiment: 'Build one workflow using test data; exercise its failure and retry paths before adding real credentials.',
  },
  'vercel/next.js': {
    role: 'Web application framework', setup: 'JavaScript/React development workflow', effort: 'Moderate',
    fit: 'Build an interactive product when your team already works with React.',
    caution: 'A framework is not a product architecture. Choose rendering, authentication and deployment deliberately.',
    experiment: 'Build one complete user journey with a loading state, a failure state and a test.',
  },
  'supabase/supabase': {
    role: 'Postgres-based application backend', setup: 'Hosted option or self-hosted stack', effort: 'Advanced for self-hosting',
    fit: 'Evaluate database-backed application features without assembling every backend component yourself.',
    caution: 'Authorization rules and backups still need testing. Self-hosting transfers operations work to your team.',
    experiment: 'Use disposable records to prove that one user cannot read another user’s private data.',
  },
  'ollama/ollama': {
    role: 'Model runtime', setup: 'Native runtime or container; model-dependent hardware', effort: 'Moderate',
    fit: 'Try running supported models on your own hardware before building a larger AI stack.',
    caution: 'Model licenses and hardware needs differ. A runtime license does not grant rights to every model.',
    experiment: 'Benchmark one small model with non-sensitive prompts and record latency and memory use.',
  },
  'open-webui/open-webui': {
    role: 'AI web interface', setup: 'Web service connected to a model backend', effort: 'Moderate',
    fit: 'Put a browser interface in front of a model service for a controlled trial.',
    caution: 'A local interface can still call external providers. Review connections, access controls and current license terms.',
    experiment: 'Use a test account and verify which configured endpoints receive a prompt.',
  },
  'Mintplex-Labs/anything-llm': {
    role: 'Document-oriented AI workspace', setup: 'Desktop or self-hosted service', effort: 'Moderate',
    fit: 'Explore asking questions of a small, non-sensitive document collection.',
    caution: 'Document retrieval can still produce wrong answers. Review model/provider settings and telemetry before sensitive use.',
    experiment: 'Ask questions with known answers and check that the cited documents actually support each answer.',
  },
};
export const guides = [
  {
    slug: 'self-hosted-essentials', title: 'Self-host without losing control.', category: 'SELF-HOSTED ESSENTIALS',
    description: 'A small operations toolkit for people willing to own their infrastructure—not a promise of free hosting.',
    audience: 'Small teams with time to maintain a server and test recovery.',
    skip: 'If nobody can own updates and restores, use a managed service instead of turning a side project into an on-call job.',
    steps: ['List the services you actually need and name the person responsible for each.', 'Start with monitoring, then test deployment and recovery with disposable data.', 'Automate one repetitive task only after its manual version is understood.'],
    names: ['louislam/uptime-kuma', 'coollabsio/coolify', 'n8n-io/n8n'],
    check: 'Can another teammate restore the service using only your written notes?',
  },
  {
    slug: 'first-saas', title: 'Ship one useful product journey.', category: 'YOUR FIRST SAAS',
    description: 'Choose a frontend, evaluate a backend, and observe the result. These projects fill different roles; they are not interchangeable alternatives.',
    audience: 'Builders validating one narrow product idea before scaling infrastructure.',
    skip: 'If a static page and a manual process can validate the idea, start there. Do not add a full application stack just to collect interest.',
    steps: ['Write down one user, one problem and one successful outcome.', 'Implement the smallest complete journey; test permissions and failure states.', 'Add monitoring before inviting users, and learn from their attempts rather than star counts.'],
    names: ['vercel/next.js', 'supabase/supabase', 'louislam/uptime-kuma'],
    check: 'Can a first-time visitor complete the main task without your explanation?',
  },
  {
    slug: 'local-ai', title: 'Try local AI with evidence.', category: 'LOCAL AI WORKBENCH',
    description: 'Separate the model runtime, interface and document workflow. Start small and verify what leaves your machine.',
    audience: 'Developers exploring a local model or a small document assistant.',
    skip: 'Do not start with confidential documents or assume local branding guarantees privacy, accuracy or sufficient hardware.',
    steps: ['Test a modest model against questions with known answers.', 'Add an interface only if it improves the workflow you are testing.', 'Introduce a few public documents; verify answers, data destinations and resource use.'],
    names: ['ollama/ollama', 'open-webui/open-webui', 'Mintplex-Labs/anything-llm'],
    check: 'Can you explain the source of an answer and every service that handled the input?',
  },
];
export const githubURL = name => 'https://github.com/' + name.split('/').map(encodeURIComponent).join('/');
