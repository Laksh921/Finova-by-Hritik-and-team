import { currentUser } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";

export const checkUser = async () => {
  const user = await currentUser();
  if (!user) return null;

  const clerkUserId = user.id;
  const email = user.emailAddresses?.[0]?.emailAddress?.toLowerCase().trim();
  if (!email) return null;

  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  const imageUrl = user.imageUrl;

  const { data: byClerkId } = await supabaseServer
    .from("users")
    .select("*")
    .eq("clerkUserId", clerkUserId)
    .maybeSingle();

  if (byClerkId) return byClerkId;

  const { data: byEmail } = await supabaseServer
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (byEmail) {
    const { data: updatedUser } = await supabaseServer
      .from("users")
      .update({
        clerkUserId,
        name,
        imageUrl,
      })
      .eq("id", byEmail.id)
      .select()
      .single();

    return updatedUser;
  }

  const { data: newUser } = await supabaseServer
    .from("users")
    .insert({
      clerkUserId,
      email,
      name,
      imageUrl,
    })
    .select()
    .single();

  return newUser;
};
