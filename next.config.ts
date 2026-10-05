import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The first-login setup is now one screen per agent (/start/setup). These three screens no longer exist; a link to one of them (an open tab or a
  // bookmark) lands on the setup for the same agent. Temporary on purpose: nothing is cached by browsers.
  redirects() {
    return ["connect", "arrived", "try"].map((old) => ({ source: `/start/${old}`, destination: "/start/setup", permanent: false }));
  },
};

export default nextConfig;
