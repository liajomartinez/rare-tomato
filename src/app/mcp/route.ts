import { envFromProcess, handleMcp } from "@/lib/handler";

export const dynamic = "force-dynamic";

const handle = (request: Request) => handleMcp(request, envFromProcess());

export { handle as GET, handle as POST, handle as DELETE };
