"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { supabase } from "../lib/supabase";

export async function syncUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const { data: existingUser } = await supabase
    .from("users")
    .select("id")
    .eq("clerkUserId", userId)
    .single();

  if (existingUser) return existingUser;

  const { data: newUser, error } = await supabase
    .from("users")
    .insert({
      clerkUserId: userId,
      email: clerkUser.emailAddresses[0]?.emailAddress,
      name: `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim(),
      imageUrl: clerkUser.imageUrl,
    })
    .select()
    .single();

  if (error) throw error;

  return newUser;
}
