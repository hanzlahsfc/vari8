import {
  type Client,
  clientProfile,
  clients as seedClients,
} from "@/lib/coaching-data";

export type ClientTask = {
  id: string;
  title: string;
  dueDate: string;
  status: "open" | "complete" | "overdue";
};

export type CoachTask = {
  id: string;
  title: string;
  complete: boolean;
  deadline?: string;
};
export type CheckIn = {
  id: string;
  date: string;
  status: "awaiting feedback" | "feedback sent";
  summary: string;
  feedback: string;
};
/** Fixed provisional category set for coach notes — labels await owner
 * approval; uncategorised notes display as Other. Optional everywhere so
 * saved workspaces need no migration. */
export type NoteCategory =
  | "health"
  | "schedule"
  | "training"
  | "nutrition"
  | "prep"
  | "other";
export type ClientNote = {
  id: string;
  text: string;
  pinned?: boolean;
  category?: NoteCategory;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkspaceClient = Client & {
  email: string;
  priorityMessages: boolean;
  trainingFlags: number;
  additionalCheckInDates: string[];
  clientTasks: ClientTask[];
  coachTasks: CoachTask[];
  internalNotes: ClientNote[];
  generalNotes: ClientNote[];
  checkIns: CheckIn[];
  messages: {
    id: string;
    text: string;
    from: "client" | "coach";
    date: string;
  }[];
  onboarding: { question: string; answer: string }[];
  archived: boolean;
};

type ClientDetails = Pick<
  WorkspaceClient,
  | "email"
  | "priorityMessages"
  | "trainingFlags"
  | "additionalCheckInDates"
  | "clientTasks"
  | "coachTasks"
  | "internalNotes"
  | "generalNotes"
  | "checkIns"
  | "messages"
  | "onboarding"
  | "archived"
>;

const details: Record<string, ClientDetails> = {
  "client-001": {
    email: "emma.anders@example.com",
    priorityMessages: true,
    trainingFlags: 1,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "emma-task-1",
        title: "Upload training log",
        status: "overdue",
        dueDate: "2026-10-02",
      },
      {
        id: "emma-task-2",
        title: "Review updated meal plan",
        status: "open",
        dueDate: "2026-10-06",
      },
      {
        id: "emma-task-3",
        title: "Confirm next check-in",
        status: "complete",
        dueDate: "2026-10-05",
      },
    ],
    coachTasks: [
      { id: "emma-coach-1", title: "Prepare feedback video", complete: false },
    ],
    internalNotes: [
      {
        id: "emma-note-1",
        text: "Review split-squat setup before increasing load.",
      },
    ],
    generalNotes: [{ id: "emma-general-1", text: "Prefers morning training." }],
    checkIns: [
      {
        id: "emma-checkin-1",
        date: "2026-10-05",
        status: "awaiting feedback",
        summary:
          "Training felt strong; left knee felt slightly unsettled after split squats.",
        feedback: "",
      },
      {
        id: "emma-checkin-2",
        date: "2026-09-25",
        status: "feedback sent",
        summary: "Steady week and consistent meal prep.",
        feedback: "Focus on controlled reps this week.",
      },
      {
        id: "emma-checkin-3",
        date: "2026-09-18",
        status: "feedback sent",
        summary: "Energy improved after moving training earlier.",
        feedback:
          "Keep the morning sessions and add load only when every rep feels stable.",
      },
    ],
    messages: [
      {
        id: "emma-message-1",
        text: "I uploaded most of the week, but I still need to add Friday's session.",
        from: "client",
        date: "2026-10-05T08:47",
      },
      {
        id: "emma-message-2",
        text: "Thanks, Emma. I’ll look at the split-squat notes with your check-in.",
        from: "coach",
        date: "2026-10-05T09:02",
      },
    ],
    onboarding: [
      {
        question: "What would make coaching feel successful?",
        answer:
          "Feeling stronger while building a routine I can keep during busy weeks.",
      },
      {
        question: "Any movements you want us to monitor?",
        answer: "Split squats can irritate my left knee if I rush the setup.",
      },
      {
        question: "When do you prefer to train?",
        answer: "Early morning, before work.",
      },
    ],
    archived: false,
  },
  "client-002": {
    email: "james.reed@example.com",
    priorityMessages: true,
    trainingFlags: 0,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "james-task-1",
        title: "Send updated posing photos",
        status: "overdue",
        dueDate: "2026-10-01",
      },
      {
        id: "james-task-2",
        title: "Confirm peak-week travel dates",
        status: "open",
        dueDate: "2026-10-07",
      },
    ],
    coachTasks: [
      {
        id: "james-coach-1",
        title: "Review missed check-in and adjust prep plan",
        complete: false,
      },
    ],
    internalNotes: [
      {
        id: "james-note-1",
        text: "Check whether late shifts are affecting meal timing.",
      },
    ],
    generalNotes: [
      {
        id: "james-general-1",
        text: "Competition date is November 14; prefers concise check-in feedback.",
      },
    ],
    checkIns: [
      {
        id: "james-checkin-1",
        date: "2026-09-24",
        status: "feedback sent",
        summary:
          "Weight trend is moving as planned; two sessions were shortened.",
        feedback: "Keep the first two lifts as the priority on short days.",
      },
    ],
    messages: [
      {
        id: "james-message-1",
        text: "Work has been running late this week. I’ll send the check-in tonight.",
        from: "client",
        date: "2026-10-04T18:25",
      },
      {
        id: "james-message-2",
        text: "Got it. Send the photos when you have good light and we’ll review together.",
        from: "coach",
        date: "2026-10-04T18:41",
      },
    ],
    onboarding: [
      {
        question: "What is your main goal?",
        answer: "Arrive at my first show feeling prepared and healthy.",
      },
      {
        question: "What is hardest to manage?",
        answer: "Meal timing around late work shifts.",
      },
    ],
    archived: false,
  },
  "client-003": {
    email: "lily.chen@example.com",
    priorityMessages: false,
    trainingFlags: 0,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "lily-task-1",
        title: "Log weekend meals",
        status: "complete",
        dueDate: "2026-10-04",
      },
    ],
    coachTasks: [],
    internalNotes: [
      {
        id: "lily-note-1",
        text: "Maintenance phase is going smoothly; keep changes small.",
      },
    ],
    generalNotes: [
      { id: "lily-general-1", text: "Enjoys trying new vegetarian lunches." },
    ],
    checkIns: [
      {
        id: "lily-checkin-1",
        date: "2026-10-02",
        status: "feedback sent",
        summary: "Energy and appetite are stable through the work week.",
        feedback:
          "Keep the current portions and use the weekend meal notes to spot patterns.",
      },
    ],
    messages: [
      {
        id: "lily-message-1",
        text: "Could you share another tofu lunch idea for next week?",
        from: "client",
        date: "2026-10-03T12:14",
      },
    ],
    onboarding: [
      {
        question: "What would you like to improve?",
        answer: "Keep my weight steady without tracking every meal.",
      },
      {
        question: "Any food preferences?",
        answer: "Mostly vegetarian; tofu and lentils are staples.",
      },
    ],
    archived: false,
  },
  "client-004": {
    email: "oliver.stone@example.com",
    priorityMessages: false,
    trainingFlags: 1,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "oliver-task-1",
        title: "Record top set for deadlift",
        status: "overdue",
        dueDate: "2026-10-03",
      },
    ],
    coachTasks: [
      {
        id: "oliver-coach-1",
        title: "Check deadlift setup video",
        complete: false,
      },
    ],
    internalNotes: [
      {
        id: "oliver-note-1",
        text: "Right shoulder elevation appears when fatigue sets in.",
      },
    ],
    generalNotes: [
      {
        id: "oliver-general-1",
        text: "Prefers barbell work; usually trains after work.",
      },
    ],
    checkIns: [
      {
        id: "oliver-checkin-1",
        date: "2026-10-02",
        status: "feedback sent",
        summary: "Strength is trending up; last deadlift set looked rushed.",
        feedback:
          "Send a side view of the next top set and stop one rep before form changes.",
      },
    ],
    messages: [
      {
        id: "oliver-message-1",
        text: "Shoulder felt fine this week, just a little tight after pressing.",
        from: "client",
        date: "2026-10-02T19:08",
      },
    ],
    onboarding: [
      {
        question: "What is your training goal?",
        answer: "Build strength without aggravating my shoulder.",
      },
      {
        question: "When do you train?",
        answer: "Usually after work, four evenings a week.",
      },
    ],
    archived: false,
  },
  "client-005": {
    email: "maya.patel@example.com",
    priorityMessages: true,
    trainingFlags: 0,
    additionalCheckInDates: ["2026-10-08"],
    clientTasks: [
      {
        id: "maya-task-1",
        title: "Choose two lunch options for travel",
        status: "open",
        dueDate: "2026-10-07",
      },
    ],
    coachTasks: [
      {
        id: "maya-coach-1",
        title: "Send travel meal framework",
        complete: false,
      },
    ],
    internalNotes: [
      {
        id: "maya-note-1",
        text: "Upcoming work trip; focus on flexible choices over exact tracking.",
      },
    ],
    generalNotes: [
      {
        id: "maya-general-1",
        text: "Checks in on Mondays; has access to a hotel gym next week.",
      },
    ],
    checkIns: [
      {
        id: "maya-checkin-1",
        date: "2026-10-05",
        status: "awaiting feedback",
        summary:
          "Good consistency; travel starts Thursday and sleep may be shorter.",
        feedback: "",
      },
    ],
    messages: [
      {
        id: "maya-message-1",
        text: "I’m away from Thursday. Can we plan a few easy hotel breakfast options?",
        from: "client",
        date: "2026-10-05T08:19",
      },
    ],
    onboarding: [
      {
        question: "What is your main goal?",
        answer:
          "Lose weight while keeping enough energy for work and training.",
      },
      {
        question: "What tends to interrupt your routine?",
        answer: "Business travel and hotel food.",
      },
    ],
    archived: false,
  },
  "client-006": {
    email: "noah.williams@example.com",
    priorityMessages: true,
    trainingFlags: 0,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "noah-task-1",
        title: "Send final session of the week",
        status: "open",
        dueDate: "2026-10-06",
      },
    ],
    coachTasks: [],
    internalNotes: [
      {
        id: "noah-note-1",
        text: "Three unread messages likely relate to show-week schedule; check before routine review.",
      },
    ],
    generalNotes: [
      {
        id: "noah-general-1",
        text: "Preparing for a local physique show; Saturday check-in.",
      },
    ],
    checkIns: [
      {
        id: "noah-checkin-1",
        date: "2026-10-03",
        status: "feedback sent",
        summary:
          "All planned sessions completed; appetite rises after evening cardio.",
        feedback:
          "Add the planned post-cardio snack and keep water intake steady.",
      },
    ],
    messages: [
      {
        id: "noah-message-1",
        text: "The venue moved check-in to Friday evening.",
        from: "client",
        date: "2026-10-04T10:20",
      },
      {
        id: "noah-message-2",
        text: "My tan appointment is now at 4 pm.",
        from: "client",
        date: "2026-10-04T10:21",
      },
      {
        id: "noah-message-3",
        text: "Should I move the last session earlier?",
        from: "client",
        date: "2026-10-04T10:22",
      },
    ],
    onboarding: [
      {
        question: "What is your event goal?",
        answer: "Feel confident and keep the final prep calm.",
      },
      {
        question: "Any key schedule constraints?",
        answer: "Show check-in details can change at short notice.",
      },
    ],
    archived: false,
  },
  "client-007": {
    email: "amara.lewis@example.com",
    priorityMessages: false,
    trainingFlags: 0,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "amara-task-1",
        title: "Track sleep for three nights",
        status: "complete",
        dueDate: "2026-10-04",
      },
    ],
    coachTasks: [],
    internalNotes: [
      {
        id: "amara-note-1",
        text: "Build lower body strength with a gradual return to heavier hinges.",
      },
    ],
    generalNotes: [
      {
        id: "amara-general-1",
        text: "Enjoys weekend hikes and strength sessions.",
      },
    ],
    checkIns: [
      {
        id: "amara-checkin-1",
        date: "2026-10-02",
        status: "feedback sent",
        summary:
          "Hikes felt good and sleep improved after keeping a regular bedtime.",
        feedback:
          "Keep the bedtime routine and progress hinge volume one set at a time.",
      },
    ],
    messages: [
      {
        id: "amara-message-1",
        text: "The new bedtime alarm helped this week.",
        from: "client",
        date: "2026-10-03T09:36",
      },
    ],
    onboarding: [
      {
        question: "What would you like to get stronger at?",
        answer: "Hinges and carrying strength for hiking.",
      },
      {
        question: "What helps you stay consistent?",
        answer: "Having a plan that leaves room for weekend hikes.",
      },
    ],
    archived: false,
  },
  "client-008": {
    email: "jack.kim@example.com",
    priorityMessages: true,
    trainingFlags: 0,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "jack-task-1",
        title: "Upload Sunday progress photos",
        status: "open",
        dueDate: "2026-10-06",
      },
    ],
    coachTasks: [
      { id: "jack-coach-1", title: "Review check-in photos", complete: false },
    ],
    internalNotes: [
      {
        id: "jack-note-1",
        text: "Check-in is awaiting coach response; compare photos under similar lighting.",
      },
    ],
    generalNotes: [
      {
        id: "jack-general-1",
        text: "Sunday check-in; currently in prep week 5.",
      },
    ],
    checkIns: [
      {
        id: "jack-checkin-1",
        date: "2026-10-04",
        status: "awaiting feedback",
        summary: "Adherence was strong; sleep dipped on two nights.",
        feedback: "",
      },
    ],
    messages: [
      {
        id: "jack-message-1",
        text: "I’ll take the photos again by the window tomorrow morning.",
        from: "client",
        date: "2026-10-04T17:32",
      },
    ],
    onboarding: [
      {
        question: "What is your current focus?",
        answer: "A steady prep routine while protecting sleep.",
      },
      {
        question: "What makes progress photos useful?",
        answer: "A consistent angle and morning lighting.",
      },
    ],
    archived: false,
  },
  "client-009": {
    email: "isla.morgan@example.com",
    priorityMessages: false,
    trainingFlags: 0,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "isla-task-1",
        title: "Add two restaurant meals to log",
        status: "complete",
        dueDate: "2026-10-03",
      },
    ],
    coachTasks: [],
    internalNotes: [
      {
        id: "isla-note-1",
        text: "Weight is stable; client is ready to practice flexible portions when eating out.",
      },
    ],
    generalNotes: [
      {
        id: "isla-general-1",
        text: "Likes going out for dinner with friends on Fridays.",
      },
    ],
    checkIns: [
      {
        id: "isla-checkin-1",
        date: "2026-10-01",
        status: "feedback sent",
        summary:
          "Maintained routine and enjoyed two social meals without overcorrecting.",
        feedback:
          "That balance is working. Keep returning to your usual routine the next day.",
      },
    ],
    messages: [
      {
        id: "isla-message-1",
        text: "Logging the meals helped me see I can keep dinner simple the next day.",
        from: "client",
        date: "2026-10-02T16:45",
      },
    ],
    onboarding: [
      {
        question: "What does maintenance mean to you?",
        answer:
          "Keeping the habits that make me feel well without avoiding social plans.",
      },
      {
        question: "Any recurring plans to work around?",
        answer: "Friday dinner with friends.",
      },
    ],
    archived: false,
  },
  "client-010": {
    email: "ethan.cole@example.com",
    priorityMessages: false,
    trainingFlags: 1,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "ethan-task-1",
        title: "Log two weekday breakfasts",
        status: "overdue",
        dueDate: "2026-09-30",
      },
      {
        id: "ethan-task-2",
        title: "Book next progress review",
        status: "overdue",
        dueDate: "2026-10-02",
      },
    ],
    coachTasks: [
      {
        id: "ethan-coach-1",
        title: "Offer a shorter check-in format",
        complete: false,
      },
    ],
    internalNotes: [
      {
        id: "ethan-note-1",
        text: "Has not checked in since September 21; lead with a low-pressure message and ask about schedule.",
      },
      {
        id: "ethan-note-2",
        text: "Avoid increasing training volume until routine is re-established.",
      },
    ],
    generalNotes: [
      {
        id: "ethan-general-1",
        text: "Starting a new role; weekday mornings are currently unpredictable.",
      },
    ],
    checkIns: [
      {
        id: "ethan-checkin-1",
        date: "2026-09-21",
        status: "feedback sent",
        summary: "Routine was disrupted by a new work schedule.",
        feedback: "Let’s choose a smaller baseline that fits the new hours.",
      },
    ],
    messages: [
      {
        id: "ethan-message-1",
        text: "I need to get settled at work before I can get back into the routine.",
        from: "client",
        date: "2026-09-21T11:14",
      },
    ],
    onboarding: [
      {
        question: "What is your biggest obstacle right now?",
        answer: "My work schedule changed and I am still finding a rhythm.",
      },
      {
        question: "What support feels useful?",
        answer: "A simple plan I can restart without feeling behind.",
      },
    ],
    archived: false,
  },
  "client-011": {
    email: "zara.ahmed@example.com",
    priorityMessages: false,
    trainingFlags: 0,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "zara-task-1",
        title: "Confirm Saturday weigh-in",
        status: "complete",
        dueDate: "2026-10-03",
      },
    ],
    coachTasks: [],
    internalNotes: [
      {
        id: "zara-note-1",
        text: "Prep is steady; small scale fluctuation likely reflects travel and sodium.",
      },
    ],
    generalNotes: [
      {
        id: "zara-general-1",
        text: "Likes to review weekly averages rather than single weigh-ins.",
      },
    ],
    checkIns: [
      {
        id: "zara-checkin-1",
        date: "2026-10-03",
        status: "feedback sent",
        summary: "Training is consistent and weekly average remains on plan.",
        feedback:
          "Stay with the current plan and keep looking at the weekly average.",
      },
    ],
    messages: [
      {
        id: "zara-message-1",
        text: "The scale was up after travel but is already back down today.",
        from: "client",
        date: "2026-10-04T08:15",
      },
    ],
    onboarding: [
      {
        question: "How do you prefer to track progress?",
        answer: "Weekly averages and training performance.",
      },
      {
        question: "Any upcoming schedule changes?",
        answer: "One overnight work trip later this month.",
      },
    ],
    archived: false,
  },
  "client-012": {
    email: "finn.walsh@example.com",
    priorityMessages: false,
    trainingFlags: 0,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "finn-task-1",
        title: "Share weekend training plan",
        status: "complete",
        dueDate: "2026-10-04",
      },
    ],
    coachTasks: [],
    internalNotes: [
      {
        id: "finn-note-1",
        text: "Strength block is progressing without missed sessions.",
      },
    ],
    generalNotes: [
      {
        id: "finn-general-1",
        text: "Prefers Sunday check-ins and short actionable cues.",
      },
    ],
    checkIns: [
      {
        id: "finn-checkin-1",
        date: "2026-10-04",
        status: "feedback sent",
        summary: "Good session quality and manageable soreness.",
        feedback:
          "Keep the same rest periods and aim for one clean rep in reserve.",
      },
    ],
    messages: [
      {
        id: "finn-message-1",
        text: "Could I swap Sunday's lift to Saturday this week?",
        from: "client",
        date: "2026-10-03T13:40",
      },
      {
        id: "finn-message-2",
        text: "That works. Keep a rest day before the next lower session.",
        from: "coach",
        date: "2026-10-03T13:52",
      },
    ],
    onboarding: [
      {
        question: "What is your main training goal?",
        answer: "Build strength while keeping sessions efficient.",
      },
      {
        question: "What makes a plan easy to follow?",
        answer: "Clear exercise order and room to move a session by a day.",
      },
    ],
    archived: false,
  },
  "client-013": {
    email: "chloe.park@example.com",
    priorityMessages: false,
    trainingFlags: 1,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "chloe-task-1",
        title: "Send Sunday step count",
        status: "overdue",
        dueDate: "2026-10-04",
      },
    ],
    coachTasks: [
      {
        id: "chloe-coach-1",
        title: "Reply to check-in and review knee note",
        complete: false,
      },
    ],
    internalNotes: [
      {
        id: "chloe-note-1",
        text: "Check-in mentions stiffness after longer walks; clarify whether it persists during training.",
      },
    ],
    generalNotes: [
      {
        id: "chloe-general-1",
        text: "Monday check-in; enjoys walking as primary cardio.",
      },
    ],
    checkIns: [
      {
        id: "chloe-checkin-1",
        date: "2026-10-05",
        status: "awaiting feedback",
        summary:
          "Weight is trending gradually down; knee felt stiff after a long walk.",
        feedback: "",
      },
    ],
    messages: [
      {
        id: "chloe-message-1",
        text: "It loosened up after I warmed up, but I wanted to mention it.",
        from: "client",
        date: "2026-10-05T08:01",
      },
    ],
    onboarding: [
      {
        question: "What is your current goal?",
        answer: "Lose weight while keeping walking comfortable.",
      },
      {
        question: "Any symptoms we should monitor?",
        answer: "Occasional knee stiffness after longer walks.",
      },
    ],
    archived: false,
  },
  "client-014": {
    email: "theo.grant@example.com",
    priorityMessages: true,
    trainingFlags: 0,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "theo-task-1",
        title: "Reschedule missed check-in",
        status: "overdue",
        dueDate: "2026-09-27",
      },
      {
        id: "theo-task-2",
        title: "Confirm new training days",
        status: "open",
        dueDate: "2026-10-06",
      },
    ],
    coachTasks: [
      {
        id: "theo-coach-1",
        title: "Reach out about onboarding support",
        complete: false,
      },
    ],
    internalNotes: [
      {
        id: "theo-note-1",
        text: "New client; check that the first two weeks feel manageable before adding targets.",
      },
    ],
    generalNotes: [
      {
        id: "theo-general-1",
        text: "Recently started coaching; Sunday was the original check-in day.",
      },
    ],
    checkIns: [
      {
        id: "theo-checkin-1",
        date: "2026-09-20",
        status: "feedback sent",
        summary:
          "Initial check-in covered schedule and beginner training options.",
        feedback:
          "Start with two repeatable sessions and tell me what feels unclear.",
      },
    ],
    messages: [
      {
        id: "theo-message-1",
        text: "Sorry, I missed the check-in. I’m still figuring out the new schedule.",
        from: "client",
        date: "2026-09-28T17:08",
      },
      {
        id: "theo-message-2",
        text: "No worries. We can make the first week simpler and build from there.",
        from: "coach",
        date: "2026-09-28T17:26",
      },
    ],
    onboarding: [
      {
        question: "What would you most like help with?",
        answer: "Building a routine that fits around shift work.",
      },
      {
        question: "What has made consistency difficult?",
        answer: "My work shifts change week to week.",
      },
    ],
    archived: false,
  },
  "client-015": {
    email: "eva.fischer@example.com",
    priorityMessages: false,
    trainingFlags: 0,
    additionalCheckInDates: [],
    clientTasks: [
      {
        id: "eva-task-1",
        title: "Try the new breakfast option",
        status: "complete",
        dueDate: "2026-10-04",
      },
    ],
    coachTasks: [],
    internalNotes: [
      {
        id: "eva-note-1",
        text: "Maintenance is stable; review how breakfast change affects afternoon hunger.",
      },
    ],
    generalNotes: [
      {
        id: "eva-general-1",
        text: "Thursday check-in; prefers German-language resources when available.",
      },
    ],
    checkIns: [
      {
        id: "eva-checkin-1",
        date: "2026-10-01",
        status: "feedback sent",
        summary: "Weight remains stable and afternoon hunger has eased.",
        feedback:
          "Keep the breakfast option for another week and note how it feels on training days.",
      },
    ],
    messages: [
      {
        id: "eva-message-1",
        text: "The yogurt and oats breakfast kept me full until lunch.",
        from: "client",
        date: "2026-10-02T14:12",
      },
    ],
    onboarding: [
      {
        question: "What is your main goal?",
        answer: "Maintain my progress and feel less hungry in the afternoon.",
      },
      {
        question: "Any communication preferences?",
        answer: "German resources are helpful when available.",
      },
    ],
    archived: false,
  },
};

export function createInitialClients(): WorkspaceClient[] {
  const initialClients = seedClients.map((client) => {
    const clientDetails = details[client.id];
    if (client.id !== clientProfile.clientId) {
      return {
        ...client,
        ...clientDetails,
        overdueTaskCount: clientDetails.clientTasks.filter(
          (task) => task.status === "overdue",
        ).length,
      } as WorkspaceClient;
    }

    const emmaHistory = clientProfile.checkInHistory.map((record, index) => {
      const expanded = clientDetails.checkIns.find(
        (checkIn) => checkIn.date === record.date,
      );
      return {
        id: `emma-checkin-${index + 1}`,
        date: record.date,
        status: record.status,
        summary: expanded?.summary ?? "Check-in submitted.",
        feedback: expanded?.feedback ?? "",
      };
    });

    return {
      ...client,
      ...clientDetails,
      coachingSince: clientProfile.coachingSince,
      clientTasks: clientProfile.clientTasks.map((task, index) => ({
        id: `emma-task-${index + 1}`,
        title: task.label,
        dueDate: task.dueDate,
        status: task.status,
      })),
      coachTasks: clientProfile.privateCoachNotes.coachTasks.map(
        (title, index) => ({
          id: `emma-coach-${index + 1}`,
          title,
          complete: false,
        }),
      ),
      internalNotes: clientProfile.privateCoachNotes.notes.map(
        (text, index) => ({ id: `emma-note-${index + 1}`, text }),
      ),
      generalNotes: clientProfile.generalNotes.map((text, index) => ({
        id: `emma-general-${index + 1}`,
        text,
      })),
      checkIns: emmaHistory,
      overdueTaskCount: clientProfile.clientTasks.filter(
        (task) => task.status === "overdue",
      ).length,
    } as WorkspaceClient;
  });

  return structuredClone(initialClients);
}

function hasCheckInAttention(client: WorkspaceClient): boolean {
  return (
    client.checkInStatus === "overdue" ||
    client.checkIns.some((checkIn) => checkIn.status === "awaiting feedback")
  );
}

export function needsAttention(client: WorkspaceClient): boolean {
  return (
    hasCheckInAttention(client) ||
    client.unreadCount > 0 ||
    client.clientTasks.some(
      (task) => task.status === "open" || task.status === "overdue",
    ) ||
    client.trainingFlags > 0
  );
}

export function statusLabel(client: WorkspaceClient): string {
  if (client.checkIns.some((checkIn) => checkIn.status === "awaiting feedback"))
    return "Awaiting feedback";
  return client.checkInStatus === "overdue" ? "Check-in overdue" : "On track";
}

export function attentionCount(client: WorkspaceClient): number {
  return (
    Number(hasCheckInAttention(client)) +
    client.unreadCount +
    client.clientTasks.filter(
      (task) => task.status === "open" || task.status === "overdue",
    ).length +
    client.trainingFlags
  );
}

export function formatClientDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}
