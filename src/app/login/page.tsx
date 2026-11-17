import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#111] px-4">
      <div className="w-full max-w-sm">
        <p className="title-cesi mb-8 text-center text-3xl text-white">
          <span className="border-b-4 border-accent pb-1">Prosit Builder</span>
        </p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
