import type { Color, TaskPriority } from "@/lib/project-constants";
import type { TemplateDefinition } from "./schema";

/**
 * The built-in template library.
 *
 * Templates are written as phases with their tasks nested inside, which
 * reads like the plan a person would sketch, then compiled into the flat
 * TemplateDefinition the database function expects. A task is due at the
 * end of its phase unless it says otherwise.
 */

export const TEMPLATE_CATEGORIES = [
  "Events",
  "Marketing",
  "Product and software",
  "Hiring and people",
  "Operations",
  "Clients and sales",
  "Personal and home",
  "School and learning",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type BuiltInTemplate = {
  id: string;
  name: string;
  category: TemplateCategory;
  /** One sentence shown on the template card. */
  summary: string;
  /** Suggested length; the wizard proposes a finish date this far ahead. */
  durationDays: number;
  color: Color;
  definition: TemplateDefinition;
};

type TaskSpec =
  | string
  | {
      title: string;
      description?: string;
      due?: number;
      priority?: TaskPriority;
      labels?: string[];
      checklist?: string[];
      subtasks?: string[];
      doing?: boolean;
    };

type PhaseSpec = { name: string; description?: string; due: number; tasks: TaskSpec[] };

const SIMPLE_COLUMNS = [{ name: "Not started" }, { name: "Doing" }, { name: "Done", isDone: true }];
const SOFTWARE_COLUMNS = [
  { name: "Backlog" },
  { name: "To do" },
  { name: "In progress" },
  { name: "In review" },
  { name: "Done", isDone: true },
];

function build(
  meta: Omit<BuiltInTemplate, "definition">,
  phases: PhaseSpec[],
  options: { columns?: TemplateDefinition["columns"]; labels?: TemplateDefinition["labels"] } = {},
): BuiltInTemplate {
  const columns = options.columns ?? SIMPLE_COLUMNS;
  const doingColumn = Math.min(1, columns.length - 1);
  const tasks: TemplateDefinition["tasks"] = phases.flatMap((phase, phaseIndex) =>
    phase.tasks.map((spec) => {
      const task = typeof spec === "string" ? { title: spec } : spec;
      return {
        title: task.title,
        description: task.description,
        phase: phaseIndex,
        column: task.doing ? doingColumn : 0,
        priority: task.priority,
        dueOffsetDays: task.due ?? phase.due,
        labels: task.labels,
        checklist: task.checklist,
        subtasks: task.subtasks,
      };
    }),
  );

  return {
    ...meta,
    definition: {
      columns,
      labels: options.labels,
      phases: phases.map((phase) => ({ name: phase.name, description: phase.description, offsetDays: phase.due })),
      tasks,
    },
  };
}

export const BLANK_TEMPLATE: BuiltInTemplate = {
  id: "blank",
  name: "Start from scratch",
  category: "Operations",
  summary: "An empty board with Not started, Doing and Done. Add your own phases and tasks.",
  durationDays: 30,
  color: "slate",
  definition: { columns: SIMPLE_COLUMNS, phases: [], tasks: [] },
};

export const TEMPLATES: BuiltInTemplate[] = [
  // Events ------------------------------------------------------------------
  build(
    { id: "team-offsite", name: "Team offsite", category: "Events", summary: "A day or two away with your team: venue, agenda, travel and follow-up.", durationDays: 45, color: "teal" },
    [
      { name: "Decide", due: -35, tasks: [
        { title: "Agree the goals for the offsite", priority: "high", checklist: ["What should we leave with?", "Who needs to be there?", "Budget per person"] },
        "Pick two or three possible dates",
        { title: "Set the budget", labels: ["Budget"] },
      ] },
      { name: "Book", due: -21, tasks: [
        { title: "Book the venue", priority: "high", subtasks: ["Shortlist three venues", "Visit or video call", "Sign the booking"] },
        "Book travel and rooms",
        "Arrange food and dietary needs",
      ] },
      { name: "Prepare", due: -3, tasks: [
        { title: "Write the agenda", checklist: ["Opening", "Working sessions", "Breaks", "Social time", "Wrap-up"] },
        "Send the agenda and travel details to everyone",
        "Prepare materials and supplies",
      ] },
      { name: "Follow up", due: 0, tasks: ["Share notes and decisions", "Send a feedback survey"] },
    ],
    { labels: [{ name: "Budget", color: "amber" }] },
  ),
  build(
    { id: "workshop", name: "Workshop or webinar", category: "Events", summary: "Plan, promote and run an online or in-person session, then follow up.", durationDays: 30, color: "blue" },
    [
      { name: "Plan", due: -24, tasks: [
        { title: "Choose the topic and audience", priority: "high" },
        "Confirm speakers",
        "Pick the date and platform or room",
      ] },
      { name: "Promote", due: -7, tasks: [
        "Create the sign-up page",
        { title: "Announce it", checklist: ["Email list", "Social posts", "Partners"] },
        "Send a reminder a week before",
      ] },
      { name: "Run", due: 0, tasks: [
        { title: "Rehearse with speakers", due: -2 },
        { title: "Prepare slides and handouts", due: -2 },
        "Host the session",
      ] },
      { name: "Follow up", due: 0, tasks: ["Send the recording and slides", "Review sign-ups and feedback"] },
    ],
  ),
  build(
    { id: "wedding", name: "Wedding planning", category: "Events", summary: "From budget and guest list to the big day, without forgetting the thank-you notes.", durationDays: 270, color: "rose" },
    [
      { name: "Foundations", due: -240, tasks: [
        { title: "Set the budget", priority: "high", labels: ["Budget"] },
        "Draft the guest list",
        "Choose a date and rough location",
      ] },
      { name: "Book the big things", due: -180, tasks: [
        { title: "Book the venue", priority: "high" },
        "Book the photographer",
        "Book catering",
        "Book music or a DJ",
      ] },
      { name: "Details", due: -45, tasks: [
        { title: "Send invitations", checklist: ["Design", "Print or digital", "Post or send", "Track replies"] },
        "Choose outfits",
        "Plan the order of the day",
        "Arrange transport",
      ] },
      { name: "The week of", due: 0, tasks: [
        { title: "Confirm final numbers with suppliers", due: -7 },
        { title: "Make the seating plan", due: -7 },
        "Enjoy the day",
      ] },
    ],
    { labels: [{ name: "Budget", color: "amber" }] },
  ),
  build(
    { id: "party", name: "Birthday or celebration", category: "Events", summary: "A small party with guests, food, decorations and a simple day-of plan.", durationDays: 21, color: "amber" },
    [
      { name: "Plan", due: -14, tasks: ["Pick the date and place", "Make the guest list", "Send invitations"] },
      { name: "Prepare", due: -2, tasks: [
        { title: "Plan the food and drink", checklist: ["Menu", "Allergies", "Shopping list"] },
        "Get decorations",
        "Order the cake",
      ] },
      { name: "Party day", due: 0, tasks: ["Set up", "Celebrate", "Clean up"] },
    ],
  ),

  // Marketing -----------------------------------------------------------------
  build(
    { id: "launch-campaign", name: "Product launch campaign", category: "Marketing", summary: "Messaging, launch assets and channels for announcing something new.", durationDays: 42, color: "violet" },
    [
      { name: "Position", due: -30, tasks: [
        { title: "Write the one-sentence message", priority: "high", description: "Who is it for, what problem does it solve, and why now?" },
        "Agree launch goals and how you'll measure them",
        "List the channels you'll use",
      ] },
      { name: "Create", due: -10, tasks: [
        { title: "Write the launch blog post", labels: ["Copy"] },
        { title: "Design launch images", labels: ["Design"] },
        { title: "Prepare the launch email", labels: ["Copy"] },
        "Update the website",
      ] },
      { name: "Launch", due: 0, tasks: [
        { title: "Brief the team and partners", due: -3 },
        { title: "Publish and send everything", priority: "high" },
        "Reply to comments and questions",
      ] },
      { name: "Learn", due: 0, tasks: ["Report results against the goals", "Note what to repeat next time"] },
    ],
    { labels: [{ name: "Copy", color: "amber" }, { name: "Design", color: "violet" }] },
  ),
  build(
    { id: "social-month", name: "Social media month", category: "Marketing", summary: "A month of planned posts with a weekly rhythm of drafting, scheduling and checking results.", durationDays: 30, color: "rose" },
    [
      { name: "Plan the month", due: -27, tasks: ["Pick three themes for the month", "Make a posting calendar", "Collect photos and ideas"] },
      { name: "Weeks 1 and 2", due: -14, tasks: ["Write and schedule week 1 posts", "Write and schedule week 2 posts", "Reply to comments"] },
      { name: "Weeks 3 and 4", due: 0, tasks: ["Write and schedule week 3 posts", "Write and schedule week 4 posts", "Reply to comments"] },
      { name: "Review", due: 0, tasks: ["Check which posts did best", "Plan next month's themes"] },
    ],
  ),
  build(
    { id: "newsletter", name: "Email newsletter", category: "Marketing", summary: "One issue from idea to inbox: content, design, testing and results.", durationDays: 14, color: "blue" },
    [
      { name: "Gather", due: -9, tasks: ["Choose the main story", "Collect links and news", "Pick a subject line"] },
      { name: "Write and design", due: -3, tasks: ["Write the newsletter", "Add images", { title: "Proofread", checklist: ["Spelling", "Links work", "Names are right"] }] },
      { name: "Send", due: 0, tasks: [{ title: "Send a test to yourself", due: -1 }, "Schedule or send", "Check opens and clicks after two days"] },
    ],
  ),
  build(
    { id: "brand-refresh", name: "Brand refresh", category: "Marketing", summary: "Update your logo, colours and voice, then roll them out everywhere.", durationDays: 75, color: "violet" },
    [
      { name: "Discover", due: -60, tasks: ["Interview customers and the team", "Audit current brand materials", "Agree what must change"] },
      { name: "Design", due: -30, tasks: ["Explore logo directions", "Choose colours and fonts", "Write voice and tone guidelines"] },
      { name: "Roll out", due: 0, tasks: [
        { title: "Update the website", priority: "high" },
        "Update social profiles",
        "Update documents and templates",
        "Announce the new look",
      ] },
    ],
  ),

  // Product and software --------------------------------------------------------
  build(
    { id: "feature-release", name: "Feature release", category: "Product and software", summary: "Take a feature from idea to release with design, build, review and launch.", durationDays: 28, color: "blue" },
    [
      { name: "Define", due: -21, tasks: [
        { title: "Write the problem and success measure", priority: "high" },
        "Sketch the solution",
        "Break the work into tasks",
      ] },
      { name: "Build", due: -7, tasks: [
        { title: "Build the main flow", doing: true },
        "Handle errors and empty states",
        "Write tests",
      ] },
      { name: "Review", due: -2, tasks: ["Code review", "Test on phone and desktop", "Fix what testing found"] },
      { name: "Release", due: 0, tasks: ["Release to everyone", "Write release notes", "Watch for errors for a few days"] },
    ],
    { columns: SOFTWARE_COLUMNS },
  ),
  build(
    { id: "bug-bash", name: "Bug fixing sprint", category: "Product and software", summary: "Collect, prioritise and fix bugs in a focused two-week push.", durationDays: 14, color: "rose" },
    [
      { name: "Collect", due: -11, tasks: ["Gather bug reports in one place", "Remove duplicates", { title: "Rank by impact", priority: "high" }] },
      { name: "Fix", due: -2, tasks: ["Fix the top five bugs", "Add tests so they don't come back", "Re-test reported cases"] },
      { name: "Ship", due: 0, tasks: ["Release the fixes", "Tell the people who reported them"] },
    ],
    { columns: SOFTWARE_COLUMNS },
  ),
  build(
    { id: "app-mvp", name: "App first version", category: "Product and software", summary: "Plan and build the smallest useful version of a new app.", durationDays: 90, color: "teal" },
    [
      { name: "Research", due: -75, tasks: ["Talk to five potential users", "Write down the core problem", "List must-have features"] },
      { name: "Design", due: -55, tasks: ["Sketch the main screens", "Make a clickable prototype", "Test the prototype with users"] },
      { name: "Build", due: -14, tasks: ["Set up the project", "Build sign-up and sign-in", "Build the core feature", "Add basic analytics"] },
      { name: "Launch", due: 0, tasks: ["Beta test with a small group", "Fix the biggest issues", { title: "Launch", priority: "high" }] },
    ],
    { columns: SOFTWARE_COLUMNS },
  ),
  build(
    { id: "website-launch", name: "Website launch", category: "Product and software", summary: "Plan pages, write copy, build and go live with a new or redesigned website.", durationDays: 45, color: "teal" },
    [
      { name: "Plan", due: -35, tasks: ["Agree the goals of the site", "List the pages", "Collect examples you like"] },
      { name: "Write and design", due: -20, tasks: [
        { title: "Write page copy", labels: ["Copy"] },
        { title: "Design the home page", labels: ["Design"] },
        "Gather images and logos",
      ] },
      { name: "Build", due: -5, tasks: ["Build the pages", "Set up forms and analytics", { title: "Check every page", checklist: ["Phone", "Tablet", "Desktop", "Spelling", "Links"] }] },
      { name: "Launch", due: 0, tasks: [{ title: "Go live", priority: "high" }, "Announce the new site"] },
    ],
    { labels: [{ name: "Copy", color: "amber" }, { name: "Design", color: "violet" }] },
  ),

  // Hiring and people -------------------------------------------------------------
  build(
    { id: "hire-role", name: "Hire for a role", category: "Hiring and people", summary: "Write the job, find candidates, interview fairly and make an offer.", durationDays: 60, color: "violet" },
    [
      { name: "Define the role", due: -50, tasks: [
        { title: "Write the job description", priority: "high", checklist: ["What they'll do", "Must-have skills", "Nice-to-haves", "Salary range"] },
        "Agree the interview steps",
      ] },
      { name: "Find candidates", due: -35, tasks: ["Post the job", "Ask the team for referrals", "Screen applications"] },
      { name: "Interview", due: -14, tasks: ["Schedule first interviews", "Run a practical exercise", "Hold final interviews", "Compare notes as a team"] },
      { name: "Offer", due: 0, tasks: [{ title: "Make the offer", priority: "high" }, "Check references", "Tell other candidates"] },
    ],
  ),
  build(
    { id: "onboarding", name: "New teammate onboarding", category: "Hiring and people", summary: "Everything a new person needs before day one, in week one and by day thirty.", durationDays: 35, color: "teal" },
    [
      { name: "Before day one", due: -30, tasks: [
        { title: "Order equipment", checklist: ["Laptop", "Accounts", "Building access"] },
        "Send a welcome email",
        "Pick a buddy",
      ] },
      { name: "Week one", due: -23, tasks: ["Welcome meeting", "Introduce them to the team", "Walk through the tools", "Set first-month goals"] },
      { name: "First month", due: 0, tasks: ["First small project", "Weekly check-ins", "30-day review"] },
    ],
  ),
  build(
    { id: "reviews", name: "Performance reviews", category: "Hiring and people", summary: "Run a fair review cycle with self-reviews, feedback and one-to-one conversations.", durationDays: 30, color: "slate" },
    [
      { name: "Prepare", due: -24, tasks: ["Share the timeline and questions", "Ask everyone for a self-review"] },
      { name: "Gather feedback", due: -12, tasks: ["Collect peer feedback", "Managers write reviews"] },
      { name: "Discuss", due: 0, tasks: ["Hold one-to-one conversations", "Agree goals for next period", "Record outcomes"] },
    ],
  ),

  // Operations -------------------------------------------------------------------
  build(
    { id: "quarterly-planning", name: "Quarterly goals", category: "Operations", summary: "Set a few clear goals for the quarter, assign owners and check progress monthly.", durationDays: 90, color: "blue" },
    [
      { name: "Set goals", due: -80, tasks: [
        { title: "Review last quarter", description: "What worked, what didn't, what we learned." },
        { title: "Choose three goals", priority: "high" },
        "Pick one owner per goal",
      ] },
      { name: "Month one", due: -60, tasks: ["Start work on each goal", "First monthly check-in"] },
      { name: "Month two", due: -30, tasks: ["Second monthly check-in", "Adjust plans if needed"] },
      { name: "Month three", due: 0, tasks: ["Final push", "Score each goal", "Share results with everyone"] },
    ],
  ),
  build(
    { id: "office-move", name: "Office move", category: "Operations", summary: "Find a space, plan the move and get everyone settled with minimal disruption.", durationDays: 90, color: "amber" },
    [
      { name: "Find a space", due: -60, tasks: ["List what we need", "Visit options", { title: "Sign the lease", priority: "high" }] },
      { name: "Plan the move", due: -14, tasks: ["Book movers", "Order furniture", "Set up internet", "Tell clients the new address"] },
      { name: "Move", due: 0, tasks: ["Pack and label", "Moving day", "Unpack and check equipment", "Welcome lunch"] },
    ],
  ),
  build(
    { id: "vendor-selection", name: "Choose a supplier or tool", category: "Operations", summary: "Compare options against clear needs, test the best ones and decide.", durationDays: 30, color: "slate" },
    [
      { name: "Needs", due: -24, tasks: ["Write down what we need", "Set a budget", "Agree who decides"] },
      { name: "Compare", due: -10, tasks: ["List options", "Ask for quotes or demos", "Score each option"] },
      { name: "Decide", due: 0, tasks: ["Try the top choice", { title: "Make the decision", priority: "high" }, "Sign up and tell the team"] },
    ],
  ),
  build(
    { id: "budget", name: "Yearly budget", category: "Operations", summary: "Review last year, gather requests and agree next year's budget.", durationDays: 45, color: "amber" },
    [
      { name: "Look back", due: -35, tasks: ["Pull last year's spending", "Note where we went over or under"] },
      { name: "Gather requests", due: -20, tasks: ["Ask each team for needs", "Estimate income"] },
      { name: "Agree", due: 0, tasks: ["Draft the budget", "Review with leadership", { title: "Share the final budget", priority: "high" }] },
    ],
  ),

  // Clients and sales ---------------------------------------------------------------
  build(
    { id: "client-project", name: "Client project", category: "Clients and sales", summary: "Kick off, deliver and hand over work for a client with clear check-ins.", durationDays: 42, color: "teal" },
    [
      { name: "Kick off", due: -35, tasks: [
        { title: "Kick-off meeting", checklist: ["Goals", "Contacts", "Timeline", "How we'll share updates"] },
        "Agree the scope in writing",
        "Collect access and assets",
      ] },
      { name: "Deliver", due: -7, tasks: ["First draft", "Client feedback round", "Final version"] },
      { name: "Hand over", due: 0, tasks: ["Hand over files and access", "Send the invoice", "Ask for a testimonial"] },
    ],
  ),
  build(
    { id: "client-onboarding", name: "New client onboarding", category: "Clients and sales", summary: "Welcome a new client and get everything set up in the first two weeks.", durationDays: 14, color: "blue" },
    [
      { name: "Welcome", due: -11, tasks: ["Send the welcome pack", "Sign the contract", "Set up billing"] },
      { name: "Set up", due: -4, tasks: ["Create their accounts", "Schedule the first meeting", "Share the project plan"] },
      { name: "First check-in", due: 0, tasks: ["Hold the first check-in", "Note open questions"] },
    ],
  ),
  build(
    { id: "proposal", name: "Proposal or tender", category: "Clients and sales", summary: "Understand the brief, write a strong proposal and submit it on time.", durationDays: 14, color: "violet" },
    [
      { name: "Understand", due: -11, tasks: ["Read the brief closely", "List questions for the client", "Decide whether to bid"] },
      { name: "Write", due: -3, tasks: ["Outline the proposal", "Write the approach", "Price the work", { title: "Review and proofread", checklist: ["Answers every question", "Pricing adds up", "Spelling"] }] },
      { name: "Submit", due: 0, tasks: [{ title: "Submit the proposal", priority: "urgent" }, "Follow up after a week"] },
    ],
  ),

  // Personal and home ---------------------------------------------------------------
  build(
    { id: "moving-house", name: "Moving house", category: "Personal and home", summary: "Everything from giving notice to unpacking the last box.", durationDays: 60, color: "amber" },
    [
      { name: "Plan", due: -45, tasks: ["Give notice or set the sale date", "Book movers or a van", "Start decluttering"] },
      { name: "Admin", due: -14, tasks: [
        { title: "Update your address", checklist: ["Bank", "Doctor", "Work", "Post redirect"] },
        "Set up internet and utilities",
      ] },
      { name: "Pack and move", due: 0, tasks: ["Pack room by room", "Moving day", "Unpack the essentials first"] },
    ],
  ),
  build(
    { id: "trip", name: "Trip planning", category: "Personal and home", summary: "Plan a trip from booking to packing, so nothing is left to the last minute.", durationDays: 45, color: "teal" },
    [
      { name: "Book", due: -30, tasks: ["Choose dates", "Book travel", "Book places to stay", "Check passports and visas"] },
      { name: "Plan", due: -7, tasks: ["Make a rough day-by-day plan", "Book activities", "Arrange travel insurance"] },
      { name: "Go", due: 0, tasks: [{ title: "Pack", due: -1, checklist: ["Documents", "Chargers", "Medicines", "Clothes"] }, "Enjoy the trip"] },
    ],
  ),
  build(
    { id: "renovation", name: "Home renovation", category: "Personal and home", summary: "Plan the work, hire trades and keep the project on budget.", durationDays: 120, color: "slate" },
    [
      { name: "Plan", due: -100, tasks: ["Decide what to change", { title: "Set the budget", labels: ["Budget"] }, "Collect ideas and photos"] },
      { name: "Hire", due: -70, tasks: ["Get three quotes", "Check reviews and references", "Agree a schedule and price"] },
      { name: "Build", due: -7, tasks: ["Work starts", "Weekly walk-through", "Track spending against the budget"] },
      { name: "Finish", due: 0, tasks: ["Final check of the work", "Pay the final invoice", "Clean and enjoy"] },
    ],
    { labels: [{ name: "Budget", color: "amber" }] },
  ),
  build(
    { id: "job-search", name: "Job search", category: "Personal and home", summary: "Get your materials ready, apply with focus and prepare well for interviews.", durationDays: 60, color: "blue" },
    [
      { name: "Get ready", due: -50, tasks: ["Decide what you're looking for", "Update your CV", "Update your online profile"] },
      { name: "Apply", due: -20, tasks: ["List target companies", "Apply to five roles a week", "Ask contacts for introductions"] },
      { name: "Interview", due: 0, tasks: ["Prepare stories for common questions", "Practise with a friend", "Send thank-you notes"] },
    ],
  ),

  // School and learning ---------------------------------------------------------------
  build(
    { id: "research-paper", name: "Research paper or thesis", category: "School and learning", summary: "From topic to final submission, broken into steady, manageable steps.", durationDays: 120, color: "violet" },
    [
      { name: "Topic", due: -105, tasks: ["Choose a topic", "Write your research question", "Agree it with your supervisor"] },
      { name: "Research", due: -60, tasks: ["Find and read sources", "Take notes with references", "Collect or analyse data"] },
      { name: "Write", due: -14, tasks: ["Write an outline", "Write the first draft", "Get feedback"] },
      { name: "Finish", due: 0, tasks: ["Revise the draft", { title: "Check references and formatting", checklist: ["Citations", "Figures", "Page numbers"] }, { title: "Submit", priority: "urgent" }] },
    ],
  ),
  build(
    { id: "exam-prep", name: "Exam study plan", category: "School and learning", summary: "Spread revision over the weeks before an exam, with practice tests built in.", durationDays: 42, color: "rose" },
    [
      { name: "Plan", due: -38, tasks: ["List every topic", "Mark topics you find hardest", "Make a weekly timetable"] },
      { name: "Study", due: -7, tasks: ["Revise topics 1 to 3", "Revise topics 4 to 6", "Revise the hardest topics again", "Do a practice paper"] },
      { name: "Final week", due: 0, tasks: ["Review your notes", "Do one last practice paper", "Rest well the night before"] },
    ],
  ),
  build(
    { id: "group-project", name: "Group school project", category: "School and learning", summary: "Split the work fairly, keep everyone on track and hand in on time.", durationDays: 28, color: "teal" },
    [
      { name: "Start", due: -24, tasks: ["Meet and agree roles", "Break the project into parts", "Agree how you'll stay in touch"] },
      { name: "Work", due: -5, tasks: ["Each person drafts their part", "Weekly check-in", "Combine the parts"] },
      { name: "Hand in", due: 0, tasks: ["Review together", "Practise the presentation", { title: "Hand in", priority: "high" }] },
    ],
  ),
  build(
    { id: "learn-skill", name: "Learn a new skill", category: "School and learning", summary: "Turn a goal like 'learn to code' into weekly practice you can actually keep.", durationDays: 56, color: "amber" },
    [
      { name: "Set up", due: -50, tasks: ["Write what you want to be able to do", "Pick one course or book", "Block practice time in your week"] },
      { name: "Practise", due: -7, tasks: ["Week 1 to 2 practice", "Week 3 to 4 practice", "Week 5 to 6 practice", "Build something small"] },
      { name: "Show it", due: 0, tasks: ["Finish a small project", "Share it with someone", "Decide what to learn next"] },
    ],
  ),
];

export function findTemplate(id: string): BuiltInTemplate | undefined {
  return id === BLANK_TEMPLATE.id ? BLANK_TEMPLATE : TEMPLATES.find((template) => template.id === id);
}
