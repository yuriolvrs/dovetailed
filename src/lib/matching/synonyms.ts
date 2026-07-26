// What this file is: a small static table of interchangeable tech terms
// (e.g. "Java" / "JVM"), used by candidate retrieval to catch requirement
// wording that doesn't literally appear in the profile text.
// In plain terms: a list of "these mean basically the same thing" word
// groups, so matching a requirement to a skill doesn't require exact wording.

/**
 * Each inner array is a group of interchangeable lowercase terms/phrases.
 * In plain terms: groups of words that count as the same thing, like "js"
 * and "javascript".
 */
export const SYNONYM_GROUPS: string[][] = [
  ['java', 'jvm'],
  ['spring', 'spring mvc', 'spring boot'],
  ['k8s', 'kubernetes'],
  ['js', 'javascript'],
  ['ts', 'typescript'],
  ['node', 'nodejs', 'node.js'],
  ['postgres', 'postgresql', 'pgsql'],
  ['ci', 'ci/cd', 'continuous integration', 'jenkins', 'github actions', 'circleci'],
  ['cd', 'ci/cd', 'continuous deployment', 'continuous delivery'],
  ['aws', 'amazon web services'],
  ['gcp', 'google cloud', 'google cloud platform'],
  ['ml', 'machine learning'],
  ['ai', 'artificial intelligence'],
  ['rest', 'restful', 'rest api'],
  ['ui', 'user interface'],
  ['ux', 'user experience'],
  // Office/productivity tools -- a posting naming one of these usually means
  // "comfortable with office software" broadly, which a general "Microsoft
  // Office" or "Google Workspace" skill line already covers.
  ['excel', 'powerpoint', 'microsoft office', 'ms office', 'word', 'outlook'],
  ['google workspace', 'google docs', 'google sheets', 'google slides'],
  // Marketing/e-commerce -- bridges posting phrasing ("digital", "e-commerce")
  // to profile evidence that names the specific platform/activity instead.
  ['e commerce', 'ecommerce', 'digital marketing', 'online selling', 'online store'],
  ['seo', 'search engine optimization', 'organic search', 'organic growth'],
  ['sku', 'stock keeping unit'],
  // Creative/content -- bridges "digital content" / "creative development"
  // posting language to specific design/content tools or activities.
  ['digital content', 'creative development', 'graphic design', 'canva', 'photography',
    'content creation', 'photo editing', 'publicity', 'promotions'],

  // --- Added 2026-07-26: broader tech/engineering vocabulary, brainstormed
  // via an external LLM (see IMPROVEMENTS_PLAN.md item 1.1) and merged in by
  // hand -- checked for exact-term overlap with the groups above and with
  // each other before adding, so no term appears in more than the one group
  // it was already sharing (postgres/ci/cd above got new terms folded in
  // rather than duplicated).
  ['frontend', 'front-end', 'front end', 'client-side'],
  ['backend', 'back-end', 'back end', 'server-side'],
  ['fullstack', 'full-stack', 'full stack'],
  ['react', 'reactjs', 'react.js'],
  ['vue', 'vuejs', 'vue.js'],
  ['angular', 'angularjs', 'angular.js'],
  ['next.js', 'nextjs'],
  ['tailwind', 'tailwindcss', 'tailwind css'],
  ['html', 'html5'],
  ['css', 'css3', 'stylesheets'],
  ['sass', 'scss'],
  ['webpack', 'vite', 'rollup', 'parcel', 'module bundler'],
  ['single page application', 'spa'],
  ['progressive web app', 'pwa'],
  ['python', 'py'],
  ['golang', 'go language', 'go'],
  ['c++', 'cpp', 'cplusplus'],
  ['c#', 'csharp', 'c sharp', '.net', 'dotnet'],
  ['ruby', 'ruby on rails', 'rails', 'ror'],
  ['rust', 'rustlang'],
  ['php', 'hypertext preprocessor'],
  ['swift', 'objective-c', 'ios development', 'ios developer'],
  ['kotlin', 'android sdk', 'android development', 'android developer'],
  ['flutter', 'react native', 'cross-platform mobile', 'mobile app development'],
  ['django', 'flask', 'fastapi'],
  ['express', 'expressjs', 'express.js', 'nest', 'nestjs'],
  ['relational database', 'rdbms', 'sql', 'sql database'],
  ['nosql', 'non-relational database', 'document database'],
  ['mysql', 'mariadb'],
  ['mongodb', 'mongo'],
  ['redis', 'memcached', 'in-memory store', 'caching'],
  ['elasticsearch', 'elastic search', 'opensearch'],
  ['dynamodb', 'dynamo'],
  ['object storage', 's3', 'amazon s3', 'blob storage', 'cloud storage'],
  ['orm', 'object-relational mapping', 'sqlalchemy', 'hibernate', 'prisma', 'typeorm'],
  ['devops', 'development operations', 'site reliability engineering', 'sre', 'systems engineering'],
  ['infrastructure as code', 'iac', 'terraform', 'pulumi', 'cloudformation'],
  ['containerization', 'containers', 'docker', 'podman'],
  // 'distributed systems' lives in its own group below (with high
  // availability/scalability/fault tolerance) rather than duplicated here.
  ['microservices', 'microservice architecture', 'soa', 'service-oriented architecture'],
  ['serverless', 'aws lambda', 'cloud functions', 'faas', 'function as a service'],
  ['api gateway', 'kong', 'envoy', 'reverse proxy', 'nginx', 'apache'],
  ['message queue', 'message broker', 'pub/sub', 'kafka', 'rabbitmq', 'activemq', 'sqs'],
  ['load balancing', 'load balancer', 'alb', 'nlb', 'haproxy'],
  ['observability', 'monitoring', 'datadog', 'prometheus', 'grafana', 'new relic', 'splunk'],
  ['linux', 'unix', 'bash', 'shell scripting', 'zsh'],
  ['azure', 'microsoft azure'],
  ['data structures and algorithms', 'dsa', 'algorithms', 'data structures'],
  ['object-oriented programming', 'oop', 'object-oriented design', 'ood'],
  ['functional programming', 'fp'],
  ['test-driven development', 'tdd', 'behavior-driven development', 'bdd'],
  ['unit testing', 'integration testing', 'e2e testing', 'end-to-end testing', 'automated testing', 'software testing'],
  ['jest', 'cypress', 'selenium', 'playwright', 'pytest', 'mocha', 'testing frameworks'],
  ['git', 'version control', 'vcs', 'github', 'gitlab', 'bitbucket'],
  ['code review', 'pull request', 'pr review', 'peer review'],
  ['design patterns', 'software architecture', 'system design', 'technical design'],
  ['refactoring', 'code optimization', 'code cleanup', 'tech debt reduction'],
  ['cybersecurity', 'information security', 'infosec', 'appsec', 'application security'],
  ['penetration testing', 'pen testing', 'ethical hacking', 'vulnerability management', 'vulnerability assessment'],
  ['authentication', 'authorization', 'auth', 'sso', 'oauth', 'oauth2', 'jwt', 'saml'],
  ['cryptography', 'encryption', 'tls', 'ssl', 'pki'],
  ['devsecops', 'secure coding', 'security engineering'],
  ['data engineering', 'data pipeline', 'etl', 'elt', 'data ingestion'],
  ['snowflake', 'bigquery', 'redshift', 'data warehouse', 'dwh'],
  ['apache spark', 'spark', 'pyspark', 'hadoop', 'big data'],
  ['large language models', 'llm', 'generative ai', 'genai', 'rag', 'retrieval-augmented generation'],
  ['deep learning', 'dl', 'neural networks', 'cnn', 'rnn', 'transformers'],
  ['pytorch', 'tensorflow', 'keras'],
  ['nlp', 'natural language processing'],
  ['computer vision', 'cv', 'opencv'],
  ['mlops', 'machine learning operations', 'model deployment', 'model monitoring'],
  ['vector database', 'pinecone', 'chroma', 'weaviate', 'qdrant', 'milvus'],
  ['graphql', 'gql'],
  ['grpc', 'protobuf', 'protocol buffers'],
  ['websockets', 'websocket', 'socket.io'],
  ['openapi', 'swagger', 'api documentation'],
  ['embedded systems', 'firmware', 'microcontrollers', 'rtos'],
  ['distributed systems', 'high availability', 'scalability', 'fault tolerance'],
  ['cloud computing', 'cloud infrastructure', 'cloud native'],

  // --- Added 2026-07-26: business/operations/corporate vocabulary, for
  // non-tech postings (same source and merge process as the block above).
  ['corporate strategy', 'strategic planning', 'business strategy', 'corporate development'],
  ['m&a', 'mergers and acquisitions', 'mergers & acquisitions', 'corporate transactions'],
  ['due diligence', 'deal diligence', 'financial due diligence'],
  ['stakeholder management', 'stakeholder engagement', 'relationship management'],
  ['change management', 'change enablement', 'organizational change management', 'ocm'],
  ['pmo', 'project management office', 'program management office'],
  ['risk management', 'risk mitigation', 'enterprise risk management', 'erm'],
  ['sox', 'sarbanes-oxley', 'internal controls', 'sox compliance'],
  ['corporate governance', 'board governance', 'company secretarial'],
  ['esg', 'environmental social and governance', 'sustainability', 'csr', 'corporate social responsibility'],
  ['procurement', 'strategic sourcing', 'purchasing', 'vendor management'],
  ['rfp', 'request for proposal', 'rfi', 'rfq'],
  ['sla', 'service level agreement', 'service levels'],
  ['budgeting', 'budget ownership', 'fiscal management', 'financial planning'],
  ['capex', 'capital expenditure', 'capital expenses'],
  ['opex', 'operating expenditure', 'operating expenses'],
  ['executive assistant', 'ea', 'administrative assistant', 'admin assistant', 'executive coordinator'],
  ['chief of staff', 'business operations', 'bizops', 'strategy director'],
  ['investor relations', 'ir', 'shareholder communications'],
  ['corporate communications', 'corp comms', 'internal communications', 'public relations', 'pr',
    'media relations', 'press relations', 'earned media'],
  ['crisis management', 'crisis communications', 'reputation management'],
  ['talent acquisition', 'recruiting', 'recruitment', 'headhunting', 'talent sourcing'],
  ['employee onboarding', 'onboarding', 'new hire orientation'],
  ['performance management', 'performance reviews', 'appraisals', 'talent management'],
  ['total rewards', 'compensation and benefits', 'comp and benefits', 'c&b'],
  ['employee engagement', 'employee retention', 'staff retention', 'workplace culture'],
  ['dei', 'de&i', 'diversity equity and inclusion', 'diversity and inclusion', 'd&i'],
  ['hris', 'human resource information system', 'workday', 'bamboohr', 'sap successfactors'],
  ['sop', 'standard operating procedure', 'standard operating procedures', 'process documentation'],
  ['process optimization', 'process improvement', 'operational efficiency', 'business process reengineering'],
  ['business intelligence', 'bi', 'data analytics', 'business analytics'],
  ['workforce planning', 'headcount planning', 'capacity planning', 'resource allocation'],
  ['benchmarking', 'competitive analysis', 'market intelligence', 'peer benchmarking',
    'competitive intelligence', 'competitor research'],
  ['contract management', 'contract administration', 'contract lifecycle management', 'clm'],
  ['vendor negotiation', 'supplier negotiation', 'contract negotiation'],
  ['brand management', 'brand strategy', 'corporate branding', 'brand marketing', 'brand building'],
  ['thought leadership', 'executive positioning', 'content strategy', 'editorial strategy',
    'content marketing', 'content production'],
  ['shared services', 'global business services', 'gbs', 'centralized services'],
  ['outsourcing', 'offshoring', 'bpo', 'business process outsourcing'],
  ['cross-functional leadership', 'cross-functional collaboration', 'cross-departmental leadership'],
  ['third-party risk management', 'tprm', 'vendor risk management'],
  ['board reporting', 'executive reporting', 'c-suite presentation', 'board presentations'],
  ['robotic process automation', 'rpa', 'workflow automation', 'process automation'],
  ['business continuity planning', 'bcp', 'disaster recovery', 'disaster recovery planning'],
  ['gdpr', 'data privacy', 'ccpa', 'information privacy'],
  ['financial modeling', 'discounted cash flow', 'dcf', 'valuation modeling'],
  ['working capital management', 'cash flow management', 'treasury management'],
  ['kpi tracking', 'metrics tracking', 'dashboarding', 'performance tracking'],
  ['agile transformation', 'business transformation', 'digital transformation'],

  // --- Added 2026-07-26 (second batch): marketing/growth vocabulary, same
  // source and merge process as the two blocks above. A few terms collided
  // with groups already added above rather than with each other -- those
  // were folded into the existing group in place (seo/benchmarking/brand
  // management/thought-leadership+public-relations, edited above) instead of
  // being duplicated here. 'gtm' collided within this list itself
  // (go-to-market vs. Google Tag Manager) -- kept only on the go-to-market
  // group since that's the far more common usage in a resume/posting.
  ['growth marketing', 'growth hacking', 'user acquisition', 'growth acquisition'],
  ['demand generation', 'demand gen', 'lead generation', 'lead gen'],
  ['performance marketing', 'paid media', 'paid acquisition', 'digital advertising'],
  ['ppc', 'pay-per-click', 'paid search', 'sem', 'search engine marketing', 'google ads'],
  ['cpc', 'cost per click'],
  ['cpa', 'cost per acquisition', 'cpl', 'cost per lead'],
  ['roas', 'return on ad spend', 'marketing roi', 'mroi'],
  ['conversion rate optimization', 'cro', 'conversion optimization', 'landing page optimization'],
  ['a/b testing', 'split testing', 'multivariate testing', 'ab testing'],
  ['copywriting', 'copywriter', 'content writing', 'ad copywriting'],
  ['brand identity', 'brand guidelines', 'visual identity', 'brand voice', 'brand style guide'],
  ['on-page seo', 'off-page seo', 'technical seo', 'link building'],
  ['keyword research', 'search intent', 'keyword strategy', 'search volume analysis'],
  ['ahrefs', 'semrush', 'moz', 'screaming frog'],
  ['social media marketing', 'smm', 'social media management', 'social strategy'],
  ['community management', 'community engagement', 'social listening', 'community building'],
  ['influencer marketing', 'creator marketing', 'influencer relations', 'influencer outreach', 'kol'],
  ['user-generated content', 'ugc', 'creator content'],
  ['hootsuite', 'buffer', 'sprout social', 'later', 'social media management tools'],
  ['email marketing', 'lifecycle marketing', 'retention marketing', 'crm marketing'],
  ['email automation', 'drip campaigns', 'email workflows', 'marketing automation'],
  ['klaviyo', 'mailchimp', 'hubspot', 'marketo', 'pardot', 'activecampaign'],
  ['click-through rate', 'ctr'],
  ['email open rate', 'open rate'],
  ['email deliverability', 'deliverability', 'inbox placement'],
  ['product marketing', 'pmm', 'product marketing manager'],
  ['go-to-market', 'gtm', 'go-to-market strategy', 'launch strategy'],
  ['sales enablement', 'sales collateral', 'pitch decks', 'battlecards'],
  ['buyer personas', 'ideal customer profile', 'icp', 'target audience', 'customer segmentation'],
  ['positioning and messaging', 'product positioning', 'value proposition', 'core messaging'],
  ['marketing analytics', 'digital analytics', 'web analytics', 'campaign analytics'],
  ['google analytics', 'ga4', 'google analytics 4', 'adobe analytics'],
  ['marketing operations', 'mops', 'martech', 'marketing tech stack'],
  ['attribution modeling', 'marketing attribution', 'multi-touch attribution', 'first-touch attribution'],
  ['customer lifetime value', 'clv', 'ltv'],
  ['customer acquisition cost', 'cac'],
  ['google tag manager', 'pixel tracking', 'conversion tracking'],
  ['press release', 'media kit', 'press kit', 'media outreach'],
  ['event marketing', 'experiential marketing', 'field marketing', 'trade show management'],
  ['webinars', 'virtual events', 'online workshops', 'webinar coordination'],
  ['creative direction', 'art direction', 'creative strategy'],
  ['visual design', 'ad creative', 'banner design'],
  ['video marketing', 'video production', 'video content', 'motion graphics'],
  ['programmatic advertising', 'dsp', 'ssp', 'display advertising', 'ad exchanges'],
  ['affiliate marketing', 'partner marketing', 'affiliate management', 'referral programs'],
  ['account-based marketing', 'abm', 'key account marketing'],
  ['omnichannel marketing', 'multi-channel marketing', 'cross-channel marketing'],
];

let canonicalIndex: Map<string, string> | null = null;

function buildIndex(): Map<string, string> {
  const index = new Map<string, string>();
  for (const group of SYNONYM_GROUPS) {
    // Alphabetically first term stands in for the whole group, so any two
    // interchangeable terms canonicalize to the same string.
    const canonical = [...group].sort()[0];
    for (const term of group) {
      index.set(term, canonical);
    }
  }
  return index;
}

/**
 * The one term standing in for the given (already-lowercased) term's synonym
 * group, or the term itself if it isn't in any group.
 *
 * In plain terms: converts a word to its "standard" spelling so equivalent
 * terms compare equal, e.g. "jvm" becomes "java".
 */
export function canonicalOf(term: string): string {
  if (!canonicalIndex) canonicalIndex = buildIndex();
  return canonicalIndex.get(term) ?? term;
}
