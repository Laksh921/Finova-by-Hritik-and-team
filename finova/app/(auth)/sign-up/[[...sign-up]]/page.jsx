import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";

export default async function Page() {
  const user = await currentUser();
  if (user) redirect("/dashboard");

  return (
    <SignUp
      afterSignUpUrl="/dashboard"
      afterSignInUrl="/dashboard"
    />
  );
}
