import { currentUser } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";

export const checkUser = async () => {
  const user = await currentUser();
  if (!user) return null;

  const clerkUserId = user.id;
  const email = user.emailAddresses?.[0]?.emailAddress
    ?.toLowerCase()
    .trim();

  if (!email) return null;

  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  const imageUrl = user.imageUrl;

  const { data, error } = await supabaseServer
    .from("users")
    .upsert(
      {
        clerkUserId,
        email,
        name,
        imageUrl,
      },
      {
        onConflict: "clerkUserId",
      }
    )
    .select()
    .single();

  if (error) {
    console.error("checkUser error:", error);
    return null;
  }

  return data;
};
