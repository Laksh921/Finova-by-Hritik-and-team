import { currentUser } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";

export const checkUser = async () => {
  const user = await currentUser();

  if (!user) {
    return null;
  }

  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

  const { data, error } = await supabaseServer
    .from("users")
    .upsert(
      {
        clerkUserId: user.id,
        name,
        imageUrl: user.imageUrl,
        email: user.emailAddresses[0].emailAddress,
      },
      {
        onConflict: "clerkUserId",
      }
    )
    .select()
    .single();

  if (error) {
    console.error("checkUser error:", error.message);
    throw error;
  }

  return data;
};
