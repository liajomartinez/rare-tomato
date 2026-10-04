import { handleAuth } from "@workos-inc/authkit-nextjs";
import { freshSignIn } from "@/db/production";
import { callbackFailureResponse } from "@/lib/sign-in-guard";

// Where WorkOS sends people back after they sign in. After sign-in, "/" decides where to go next.
// A fresh sign-in lifts the "account deleted" mark for that sign-in id, so coming back after a deletion starts a new, empty account.
export const GET = handleAuth({
  returnPathname: "/",
  onSuccess: async ({ user }) => {
    if (user?.id) await freshSignIn(user.id);
  },
  // A failed return is not left as a bare error page: clear the old sign-in cookies and start a clean sign-in once.
  onError: ({ request }) => callbackFailureResponse(request),
});
