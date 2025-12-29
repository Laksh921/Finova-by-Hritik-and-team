import { currentUser } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";

export const checkUser = async () => {
  const user = await currentUser();
  if (!user) return null;

  const clerkUserId = user.id;
  const email = user.emailAddresses[0].emailAddress.toLowerCase().trim();
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  const imageUrl = user.imageUrl;

  // 1️⃣ Try finding user by clerkUserId
  const { data: byClerkId } = await supabaseServer
    .from("users")
    .select("*")
    .eq("clerkUserId", clerkUserId)
    .maybeSingle();

  if (byClerkId) return byClerkId;

  // 2️⃣ Try finding user by email
  const { data: byEmail } = await supabaseServer
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (byEmail) {
    // 🔁 Attach clerkUserId to existing email record
    const { data: updatedUser, error } = await supabaseServer
      .from("users")
      .update({
        clerkUserId,
        name,
        imageUrl,
      })
      .eq("id", byEmail.id)
      .select()
      .single();

    if (error) throw error;
    return updatedUser;
  }

  // 3️⃣ Truly new user → insert
  const { data: newUser, error } = await supabaseServer
    .from("users")
    .insert({
      clerkUserId,
      email,
      name,
      imageUrl,
    })
    .select()
    .single();

  if (error) throw error;

  return newUser;
};
