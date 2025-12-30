"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { supabase } from "../lib/supabase";

export async function syncUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email = clerkUser.emailAddresses?.[0]?.emailAddress
    ?.toLowerCase()
    .trim();

  if (!email) return null;

  const { data: byClerkId } = await supabase
    .from("users")
    .select("*")
    .eq("clerkUserId", userId)
    .maybeSingle();

  if (byClerkId) return byClerkId;

  const { data: byEmail } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (byEmail) {
    const { data: updatedUser } = await supabase
      .from("users")
      .update({
        clerkUserId: userId,
        name: `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim(),
        imageUrl: clerkUser.imageUrl,
      })
      .eq("id", byEmail.id)
      .select()
      .single();

    return updatedUser;
  }

  const { data: newUser, error } = await supabase
    .from("users")
    .insert({
      clerkUserId: userId,
      email,
      name: `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim(),
      imageUrl: clerkUser.imageUrl,
    })
    .select()
    .single();

  if (error) return null;

  return newUser;
}
