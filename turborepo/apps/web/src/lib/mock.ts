import type {
  ChatThread,
  KeyboardShortcut,
  Message,
  Model,
  UserProfile
} from "@/types/ui"; // Added Model

export const mockUserProfile = {
  id: "Kfow1pduT6A=",
  name: "Andrew Ross",
  email: "andrew@windycitydevs.io",
  image: "/placeholder.svg?width=40&height=40&query=user+avatar",
  plan: "Free",
  messageUsage: {
    current: 4,
    limit: 20
  }
} satisfies UserProfile;

export const mockChatThreads: ChatThread[] = [
  { id: "1", title: "Supermassive Blackhole at Un...", lastMessageAt: "Today" },
  {
    id: "2",
    title: "Exploring Next.js 15 features",
    lastMessageAt: "Yesterday"
  },
  { id: "3", title: "AI Ethics Discussion", lastMessageAt: "Mon" }
];

export const mockMessages: Message[] = [
  {
    id: "1",
    sender: "user",
    text: "Tell me about the Riemann Hypothesis.",
    timestamp: "10:00 AM",
    avatar: "/placeholder.svg?width=32&height=32&query=user+icon"
  },
  {
    id: "2",
    sender: "ai",
    text: "The Riemann Hypothesis is one of the most important unsolved problems in mathematics. It concerns the zeros of the Riemann zeta function, denoted $\\zeta(s)$. The hypothesis states that all non-trivial zeros of $\\zeta(s)$ have a real part of $Re(s) = \\frac{1}{2}$.\n\nThe Riemann zeta function is defined for complex numbers $s$ with $Re(s) > 1$ by the Dirichlet series:\n\n$$\\zeta(s) = \\sum_{n=1}^{\\infty} \\frac{1}{n^s} = \\frac{1}{1^s} + \\frac{1}{2^s} + \\frac{1}{3^s} + \\cdots$$\n\nAnd can be analytically continued to the whole complex plane, except for a simple pole at $s=1$. The trivial zeros are the negative even integers, i.e., $s = -2, -4, -6, \\ldots$. The non-trivial zeros are the focus of the hypothesis.",
    timestamp: "10:01 AM",
    model: "GPT-4o mini",
    avatar: "/placeholder.svg?width=32&height=32&query=ai+icon"
  },
  {
    id: "3",
    sender: "user",
    text: "What are its implications?",
    timestamp: "10:02 AM",
    avatar: "/placeholder.svg?width=32&height=32&query=user+icon"
  },
  {
    // Adding the lift equation example for testing
    id: "4",
    sender: "ai",
    text: "Sure, here's an example of a common physics equation, the lift equation: \n\n$$L = \\frac{1}{2} \\rho v^2 S C_L$$\n\nWhere:\n- $L$ is the lift force\n- $\\rho$ (rho) is the air density\n- $v$ is the true airspeed\n- $S$ is the planform area of the wing\n- $C_L$ is the lift coefficient",
    timestamp: "10:05 AM",
    model: "GPT-4o mini",
    avatar: "/placeholder.svg?width=32&height=32&query=ai+icon"
  }
];

export const mockEmptyStatePrompts = {
  Create: [
    "Write a short story about a robot discovering emotions",
    "Help me outline a sci-fi novel set in a post-apocalyptic world",
    "Create a character profile for a complex villain with sympathetic motives",
    "Give me 5 creative writing prompts for flash fiction"
  ],
  Explore: [
    "What are some recent breakthroughs in quantum computing?",
    "Explain the concept of dark matter and dark energy",
    "Summarize the history of artificial intelligence",
    "What are the potential benefits and risks of gene editing?"
  ],
  Code: [
    "Write code to invert a binary search tree in Python",
    "What's the difference between Promise.all and Promise.allSettled?",
    "Explain React's useEffect cleanup function",
    "Best practices for error handling in async/await"
  ],
  Learn: [
    "Beginner's guide to TypeScript",
    "Explain the CAP theorem in distributed systems",
    "Why is AI so expensive?",
    "Are black holes real?"
  ]
};

export const mockKeyboardShortcuts: KeyboardShortcut[] = [
  { action: "Search", keys: ["Ctrl", "K"] },
  { action: "New Chat", keys: ["Shift", "O"] },
  { action: "Toggle Sidebar", keys: ["Ctrl", "B"] }
];

export const availableModels = [
  // Added Model[] type
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    icon: "/google-gemini-icon.svg"
  },
  {
    id: "gpt-4.1",
    name: "gpt-4.1",
    icon: "/chatgpt-icon.svg"
  },
  {
    id: "gpt-o4-mini",
    name: "o4-mini",
    icon: "/chatgpt-icon.svg"
  },
  {
    id: "claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    icon: "/claude-ai-icon.svg"
  },
  {
    id: "xai-grok-3",
    name: "Grok 3",
    icon: "/grok-icon.svg"
  }
] satisfies Model[];
