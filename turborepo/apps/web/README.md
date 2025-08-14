

```js
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fixed Sidebar Layout</title>
    <!-- Include Tailwind CSS for styling -->
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        /* Define the CSS variables used by Tailwind's arbitrary value classes in the HTML */
        :root {
            --sidebar-width: 16rem; /* Increased slightly for better visibility */
            --sidebar-width-icon: 4rem;
        }
        /* Basic font styling for demonstration */
        body {
            font-family: 'Inter', sans-serif;
        }
        /* Ensure the HTML and Body take up the full height */
        html, body {
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden; /* Prevent scrollbars from the main layout */
        }
    </style>
</head>
<body class="bg-slate-900 text-white m-0 h-[100dvh] w-[100dvw] overflow-hidden p-0 antialiased">
    
    <!-- Main container for the entire application layout -->
    <div class="bg-slate-900 text-white h-screen w-screen overflow-hidden">
        
        <!-- Wrapper for the sidebar and main content, using flexbox -->
        <div class="group/sidebar-wrapper flex min-h-svh w-full">
            
            <!-- This container holds both the sidebar and the main content area -->
            <div class="flex h-screen w-screen overflow-hidden">

                <!-- 
                  SIDEBAR ELEMENT
                  - Uses 'peer' so the main content can react to its state using 'peer-data-*' classes.
                  - `data-state` will be toggled between "expanded" and "collapsed" by JavaScript.
                -->
                <div class="group peer text-slate-300 hidden md:block" data-state="expanded" data-side="left" data-slot="sidebar">
                    
                    <!-- 
                      This gap element creates space for the sidebar, and its width changes
                      when the sidebar is collapsed to an icon-only view.
                    -->
                    <div data-slot="sidebar-gap" class="relative w-[var(--sidebar-width)] bg-transparent transition-all duration-300 ease-in-out group-data-[state=collapsed]:w-[var(--sidebar-width-icon)]"></div>
                    
                    <!-- 
                      This is the visible container for the sidebar content.
                      It's fixed to the left side of the screen.
                    -->
                    <div data-slot="sidebar-container" class="bg-slate-800/50 fixed inset-y-0 left-0 z-10 hidden h-svh w-[var(--sidebar-width)] border-r border-slate-700 transition-all duration-300 ease-in-out group-data-[state=collapsed]:w-[var(--sidebar-width-icon)] md:flex">
                        <div class="flex h-full w-full flex-col p-4">
                            <h1 class="text-xl font-bold mb-4">Chat App</h1>
                            <div class="flex-1">
                                <p>Sidebar Content</p>
                                <p class="text-sm text-slate-400 mt-2">Recent chats would go here.</p>
                            </div>
                            <p class="text-sm text-slate-400">User Profile</p>
                        </div>
                    </div>

                    <!-- 
                      SIDEBAR RAIL / RESIZE HANDLE
                      - This is the button that was disappearing.
                      - It's positioned absolutely relative to the sidebar.
                      - **FIX**: I've given it a high z-index (z-30) to ensure it appears above the main content.
                    -->
                    <button data-sidebar="rail" aria-label="Toggle Sidebar" title="Toggle Sidebar" class="absolute inset-y-0 z-30 hidden w-4 -translate-x-1/2 cursor-pointer items-center justify-center transition-all ease-linear after:h-full after:w-[2px] after:bg-slate-600 hover:after:bg-blue-500 group-data-[side=left]:-right-2 sm:flex">
                         <!-- Visual indicator for the handle -->
                        <div class="h-8 w-1.5 bg-slate-600 rounded-full group-hover:bg-blue-500 transition-colors"></div>
                    </button>
                </div>

                <!-- 
                  MAIN CONTENT AREA
                  - Uses `peer-data-*` to adjust its margin when the sidebar collapses.
                  - **FIX**: Added `relative` and `z-20` to establish a stacking context below the sidebar rail (z-30)
                    but above other content, preventing the rail from being hidden.
                -->
                <main class="bg-slate-900 relative flex w-full flex-1 flex-col z-20">
                    <div class="flex h-full flex-col">
                        <header class="border-slate-700 bg-slate-900 flex h-14 shrink-0 items-center justify-between border-b px-4">
                            <div class="flex items-center">
                                <!-- This is the primary toggle button visible inside the header -->
                                <button data-sidebar="trigger" class="ring-offset-background -ml-2 inline-flex size-8 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-slate-700">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect width="18" height="18" x="3" y="3" rx="2"></rect><line x1="9" x2="9" y1="3" y2="21"></line>
                                    </svg>
                                    <span class="sr-only">Toggle Sidebar</span>
                                </button>
                                <div class="mx-2 h-6 w-px bg-slate-700"></div>
                                <h2 class="font-semibold">Main Content</h2>
                            </div>
                            <div class="flex items-center space-x-2">
                                <p class="text-sm text-slate-400">Header Controls</p>
                            </div>
                        </header>
                        <main class="flex-1 overflow-y-auto p-6">
                            <div class="mx-auto flex h-full max-w-4xl flex-col items-center justify-center text-center">
                                <h1 class="text-3xl font-bold">How may I help you today?</h1>
                                <p class="text-slate-400 mt-2 text-lg">This is the main chat interface.</p>
                            </div>
                        </main>
                    </div>
                </main>
            </div>
        </div>
    </div>

    <script>
        // Simple JavaScript to make the sidebar toggle functional for demonstration.
        document.addEventListener('DOMContentLoaded', () => {
            // Get the sidebar element and the two buttons that can toggle it.
            const sidebar = document.querySelector('[data-slot="sidebar"]');
            const headerTrigger = document.querySelector('[data-sidebar="trigger"]');
            const railTrigger = document.querySelector('[data-sidebar="rail"]');

            // Function to handle the toggle logic
            const toggleSidebar = () => {
                if (sidebar) {
                    const currentState = sidebar.getAttribute('data-state');
                    if (currentState === 'expanded') {
                        sidebar.setAttribute('data-state', 'collapsed');
                    } else {
                        sidebar.setAttribute('data-state', 'expanded');
                    }
                }
            };

            // Add click listeners to both buttons
            if (headerTrigger) {
                headerTrigger.addEventListener('click', toggleSidebar);
            }
            if (railTrigger) {
                railTrigger.addEventListener('click', toggleSidebar);
            }
        });
    </script>
</body>
</html>
```
