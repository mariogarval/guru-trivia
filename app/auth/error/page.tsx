import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-xl font-bold text-slate-100 mb-2">Sign In Failed</h2>
      <p className="text-slate-400 text-sm mb-6">
        Something went wrong during sign in. Please try again.
      </p>
      <Link
        href="/auth/login"
        className="bg-brand-green text-dark-bg font-bold py-3 px-8 rounded-2xl"
      >
        Try Again
      </Link>
    </div>
  );
}
