"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    // global-error must include html and body tags
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
        <details className="[&_details[open]]:p-2 [&_details[open]_summary]:mb-2 [&_details[open]_summary]:border-b [&_details[open]_summary]:border-solid [&_details[open]_summary]:border-[#aaa]">
          <summary className="mx-0 -my-2 p-2 font-sans">Details</summary>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </details>
      </body>
    </html>
  );
}
