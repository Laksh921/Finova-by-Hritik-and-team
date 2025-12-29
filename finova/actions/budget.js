"use server";

import { supabase } from "../lib/supabase";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

export async function getCurrentBudget(accountId) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) throw new Error("Unauthorized");

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .single();

    if (!user) {
      throw new Error("User not found");
    }

    const { data: budget } = await supabase
      .from("budgets")
      .select("*")
      .eq("userId", user.id)
      .single();

    const currentDate = new Date();
    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const endOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    );

    const { data: expenses } = await supabase
      .from("transactions")
      .select("amount")
      .eq("userId", user.id)
      .eq("type", "EXPENSE")
      .eq("accountId", accountId)
      .gte("date", startOfMonth.toISOString())
      .lte("date", endOfMonth.toISOString());

    const totalExpenses = expenses
      ? expenses.reduce((sum, t) => sum + t.amount, 0)
      : 0;

    return {
      budget: budget || null,
      currentExpenses: totalExpenses,
    };
  } catch (error) {
    console.error("Error fetching budget:", error);
    throw error;
  }
}

export async function updateBudget(amount) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) throw new Error("Unauthorized");

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .single();

    if (!user) throw new Error("User not found");

    const { data: existingBudget } = await supabase
      .from("budgets")
      .select("id")
      .eq("userId", user.id)
      .single();

    let budget;

    if (existingBudget) {
      const { data } = await supabase
        .from("budgets")
        .update({ amount })
        .eq("userId", user.id)
        .select()
        .single();
      budget = data;
    } else {
      const { data } = await supabase
        .from("budgets")
        .insert({
          userId: user.id,
          amount,
        })
        .select()
        .single();
      budget = data;
    }

    revalidatePath("/dashboard");

    return {
      success: true,
      data: budget,
    };
  } catch (error) {
    console.error("Error updating budget:", error);
    return { success: false, error: error.message };
  }
}
