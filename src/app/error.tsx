"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-600">
      <p className="text-lg font-medium">Something went wrong</p>
      <p className="text-sm text-gray-400">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
      >
        Try again
      </button>
    </div>
  );
}
