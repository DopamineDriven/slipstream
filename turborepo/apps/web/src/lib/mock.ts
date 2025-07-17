import type {
  KeyboardShortcut
} from "@/types/ui";



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


