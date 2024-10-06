"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "./auth";
import { getBookings } from "./data-service";
import { supabase } from "./supabase";

export async function updateProfile(formData) {
  const session = await auth();
  if (!session) throw new Error("You must be logged in");

  const national_id = formData.get("national_id");
  const [nationality, country_flag] = formData.get("nationality").split("%");

  if (!/^[a-zA-Z0-9]{6,12}$/.test(national_id))
    throw new Error("Please provide a valid national id");

  const updateData = { nationality, country_flag, national_id };

  const { data, error } = await supabase
    .from("guests")
    .update(updateData)
    .eq("id", session.user.guest_id);

  if (error) throw new Error("Guest could not be updated");

  revalidatePath("/account/profile");
}

export async function signInAction() {
  await signIn("google", { redirectTo: "/account" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function deleteReservation(bookingId) {
  const session = await auth();
  if (!session) throw new Error("You must be logged in");

  const guestBookings = await getBookings(session.user.guest_id);
  const guestBookingsId = guestBookings.map((booking) => booking.id);

  if (!guestBookingsId.includes(bookingId))
    throw new Error("You are not allowed to delete this booking");

  const { error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", bookingId);

  if (error) throw new Error("Booking could not be deleted");

  revalidatePath("/account/reservations");
}

export async function updateReservation(formData) {
  const bookingId = Number(formData.get("bookingId"));

  // * 1) Authentication
  const session = await auth();
  if (!session) throw new Error("You must be logged in");

  // * 2) Authorization
  const guestBookings = await getBookings(session.user.guest_id);
  const guestBookingsId = guestBookings.map((booking) => booking.id);

  if (!guestBookingsId.includes(bookingId))
    throw new Error("You are not allowed to update this booking");

  // * 3) Building update data
  const updateData = {
    num_guests: Number(formData.get("num_guests")),
    observations: formData.get("observations").slice(0, 1000),
  };

  // * 4) Mutation
  const { error } = await supabase
    .from("bookings")
    .update(updateData)
    .eq("id", bookingId)
    .select()
    .single();

  // * 5) Error handling
  if (error) throw new Error("Booking could not be updated");

  // * 6) Revalidating the path
  revalidatePath(`/account/reservations/edit/${bookingId}`);

  // * 7) Redirecting
  redirect("/account/reservations");
}

export async function createReservation(bookingData, formData) {
  const session = await auth();
  if (!session) throw new Error("You must be logged in");

  const newBooking = {
    ...bookingData,
    guest_id: session.user.guest_id,
    num_guests: Number(formData.get("num_guests")),
    observations: formData.get("observations").slice(0, 1000),
    extra_price: 0,
    total_price: bookingData.cabin_price,
    is_paid: false,
    has_breakfast: false,
    status: "unconfirmed",
  };

  const { error } = await supabase.from("bookings").insert([newBooking]);

  if (error) throw new Error("Booking could not be created");

  revalidatePath(`/cabins/${bookingData.cabin_id}`);

  redirect("/cabins/thankyou");
}
