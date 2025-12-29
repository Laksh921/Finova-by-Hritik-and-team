import { currentUser } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";

export const checkUser = async () => {
  const user = await currentUser();
  if (!user) return null;

  const clerkUserId = user.id;
  const email = user.emailAddresses[0].emailAddress.toLowerCase().trim();
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

  // 1️⃣ Try to find user by clerkUserId
  const { data: existingUser, error: fetchError } =
    await supabaseServer
      .from("users")
      .select("*")
      .eq("clerkUserId", clerkUserId)
      .single();

  if (existingUser) {
    return existingUser;
  }

  if (fetchError && fetchError.code !== "PGRST116") {
    throw fetchError;
  }

  // 2️⃣ Insert ONLY if user does not exist
  const { data: newUser, error: insertError } =
    await supabaseServer
      .from("users")
      .insert({
        clerkUserId,
        email,
        name,
        imageUrl: user.imageUrl,
      })
      .select()
      .single();

  if (insertError) {
    console.error("checkUser insert error:", insertError);
    throw insertError;
  }

  return newUser;
};
