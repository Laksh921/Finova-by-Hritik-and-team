import { currentUser } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";

export const checkUser = async () => {
  try {
    const user = await currentUser();
    if (!user) return null;

    const clerkUserId = user.id;

    const email = user.emailAddresses?.[0]?.emailAddress
      ?.toLowerCase()
      .trim();

    if (!email) return null;

    const name =
      `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || null;

    const imageUrl = user.imageUrl ?? null;

    // 🔹 STEP 1: Upsert (do NOT expect return value)
    const { error: upsertError } = await supabaseServer
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
      );

    if (upsertError) {
      console.error("Supabase upsert error:", upsertError);
      return null;
    }

    // 🔹 STEP 2: Fetch safely (NO `.single()`)
    const { data, error: fetchError } = await supabaseServer
      .from("users")
      .select("*")
      .eq("clerkUserId", clerkUserId)
      .limit(1);

    if (fetchError) {
      console.error("Supabase fetch error:", fetchError);
      return null;
    }

    return data?.[0] ?? null;
  } catch (err) {
    console.error("checkUser fatal error:", err);
    return null; 
  }
};
