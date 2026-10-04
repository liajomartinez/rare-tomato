// Kept apart from the server code so the feed screen can import it. See spec FR-D2.

/** Stored as codes (FR-D2). The labels are what the person sees. */
export const REASONS: { code: string; label: string }[] = [
  { code: "wrong_time_or_date", label: "Wrong time or date" },
  { code: "wrong_person", label: "Wrong person" },
  { code: "tone", label: "Too formal or casual" },
  { code: "shouldnt_have_done_this", label: "Shouldn't have done this" },
  { code: "missed_preference", label: "Missed a preference" },
  { code: "overstepped_or_untrue", label: "Overstepped or claimed something untrue" },
  { code: "other", label: "Other" },
];
