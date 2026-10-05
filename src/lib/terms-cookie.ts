// The one box on Create your account ("I am 18 or older and agree to the Terms and Privacy Notice.") is ticked BEFORE the hosted sign-in page, where there
// is no account yet to record it on. So the tick leaves one small cookie holding the Terms version that was shown; right after sign-in the server records
// the acceptance, with the time, on the account (users.terms_accepted_at and users.adult_attested_at) and the "One quick thing" step is not shown.
// The cookie holds no personal detail, lasts an hour and is named on the Privacy Notice. A person who signs in without ticking it first still sees the
// same single box on /welcome.

export const TERMS_COOKIE = "rt_terms";
export const TERMS_COOKIE_SECONDS = 60 * 60;
